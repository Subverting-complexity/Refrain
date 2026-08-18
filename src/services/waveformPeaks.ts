import { WaveformPeaks } from '../types';

export const DEFAULT_BUCKET_COUNT = 200;
const WAV_HEADER_RIFF = 0x52494646;
const WAV_FORMAT_CHUNK = 0x666d7420;
const WAV_DATA_CHUNK = 0x64617461;

// `fmt ` chunk audioFormat codes. PCM stores integer samples; IEEE float
// stores 32/64-bit floats. 32-bit WAVs are almost always float, so they must
// be distinguished from genuine 32-bit PCM before decoding.
const WAV_AUDIO_FORMAT_PCM = 1;
const WAV_AUDIO_FORMAT_IEEE_FLOAT = 3;

// Size of each streamed read window. Bounds peak memory to this plus the
// (tiny) peaks array, instead of buffering the entire file at once.
const READ_WINDOW_BYTES = 256 * 1024;

/**
 * Random-access byte source over a file. Implementations read on demand so
 * callers never hold the whole file in memory at once.
 *
 * Platform-agnostic by design: the native analyzer backs this with an
 * `expo-file-system` file handle, while the web analyzer backs it with an
 * in-memory `Uint8Array` (see {@link createBufferReader}). The peak
 * computation below depends only on this interface, so it is identical on
 * every platform.
 */
export interface ByteReader {
  readonly size: number;
  /**
   * Reads up to `length` bytes starting at `offset`. May return fewer bytes
   * than requested only when the end of the file is reached.
   */
  readAt(offset: number, length: number): Uint8Array;
}

/**
 * Wraps an already-buffered byte array as a {@link ByteReader}. Used by the
 * web path, where the audio bytes arrive whole as an `ArrayBuffer` (from
 * `fetch(objectUrl)`) because the browser has no random-access file handle.
 * Returns subarray views, so no second copy of the file is made.
 */
export function createBufferReader(bytes: Uint8Array): ByteReader {
  return {
    size: bytes.length,
    readAt(offset: number, length: number): Uint8Array {
      const start = Math.max(0, Math.min(offset, bytes.length));
      const end = Math.max(
        start,
        Math.min(start + Math.max(0, length), bytes.length),
      );
      return bytes.subarray(start, end);
    },
  };
}

/** Reads a single sample from a frame's first channel, normalized to [-1, 1]. */
function readSample(
  view: DataView,
  byteOffset: number,
  bytesPerSample: number,
  audioFormat: number,
): number {
  if (bytesPerSample === 2) {
    return view.getInt16(byteOffset, true) / 32768;
  }
  if (bytesPerSample === 1) {
    return (view.getUint8(byteOffset) - 128) / 128;
  }
  if (bytesPerSample === 4) {
    // 32-bit WAVs are typically IEEE float; only genuine PCM is Int32.
    return audioFormat === WAV_AUDIO_FORMAT_IEEE_FLOAT
      ? view.getFloat32(byteOffset, true)
      : view.getInt32(byteOffset, true) / 2147483648;
  }
  return 0;
}

type WavDataLayout = {
  dataOffset: number;
  dataSize: number;
  bytesPerSample: number;
  bytesPerFrame: number;
  audioFormat: number;
};

/**
 * Whether the sample decoder supports this format/bit-depth pair. Anything
 * else (e.g. WAVE_FORMAT_EXTENSIBLE, 64-bit float, compressed codecs) returns
 * false so the caller falls back to byte-magnitude derivation rather than
 * emitting garbage peaks.
 */
function isSupportedWavFormat(
  audioFormat: number,
  bytesPerSample: number,
): boolean {
  if (audioFormat === WAV_AUDIO_FORMAT_PCM) {
    return bytesPerSample === 1 || bytesPerSample === 2 || bytesPerSample === 4;
  }
  if (audioFormat === WAV_AUDIO_FORMAT_IEEE_FLOAT) {
    return bytesPerSample === 4;
  }
  return false;
}

/**
 * Walks the WAV chunk headers using small reads to locate the `data` chunk and
 * the format parameters, without buffering the audio payload.
 */
function locateWavData(reader: ByteReader): WavDataLayout | null {
  if (reader.size < 44) return null;

  const header = reader.readAt(0, 12);
  if (header.length < 12) return null;
  const headerView = new DataView(
    header.buffer,
    header.byteOffset,
    header.byteLength,
  );
  if (headerView.getUint32(0, false) !== WAV_HEADER_RIFF) return null;

  let offset = 12;
  let bitsPerSample = 16;
  let numChannels = 1;
  let audioFormat = WAV_AUDIO_FORMAT_PCM;

  while (offset + 8 <= reader.size) {
    const chunkHeader = reader.readAt(offset, 8);
    if (chunkHeader.length < 8) break;
    const chunkView = new DataView(
      chunkHeader.buffer,
      chunkHeader.byteOffset,
      chunkHeader.byteLength,
    );
    const chunkId = chunkView.getUint32(0, false);
    const chunkSize = chunkView.getUint32(4, true);

    if (chunkId === WAV_FORMAT_CHUNK) {
      const fmt = reader.readAt(offset + 8, 16);
      if (fmt.length >= 16) {
        const fmtView = new DataView(
          fmt.buffer,
          fmt.byteOffset,
          fmt.byteLength,
        );
        audioFormat = fmtView.getUint16(0, true);
        numChannels = fmtView.getUint16(2, true);
        bitsPerSample = fmtView.getUint16(14, true);
      }
    } else if (chunkId === WAV_DATA_CHUNK) {
      const bytesPerSample = bitsPerSample / 8;
      const bytesPerFrame = bytesPerSample * Math.max(1, numChannels);
      if (bytesPerFrame <= 0) return null;
      if (!isSupportedWavFormat(audioFormat, bytesPerSample)) return null;
      return {
        dataOffset: offset + 8,
        dataSize: chunkSize,
        bytesPerSample,
        bytesPerFrame,
        audioFormat,
      };
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++;
  }

  return null;
}

/**
 * Computes RMS peaks for a WAV file by streaming the data region in bounded
 * windows. Frames are assigned to buckets exactly as a single-pass scan would,
 * so peak values match a full-buffer computation.
 */
function parseWavPeaks(
  reader: ByteReader,
  bucketCount: number,
): WaveformPeaks | null {
  const layout = locateWavData(reader);
  if (!layout) return null;

  const { dataOffset, dataSize, bytesPerSample, bytesPerFrame, audioFormat } =
    layout;
  const availableBytes = Math.max(
    0,
    Math.min(dataSize, reader.size - dataOffset),
  );
  const totalFrames = Math.floor(availableBytes / bytesPerFrame);
  if (totalFrames === 0) return null;

  const framesPerBucket = Math.max(1, Math.floor(totalFrames / bucketCount));
  const usableFrames = Math.min(totalFrames, framesPerBucket * bucketCount);

  const sumSquares = new Float64Array(bucketCount);
  const counts = new Float64Array(bucketCount);

  // Align each read window to whole frames so samples never straddle a window.
  const framesPerWindow = Math.max(
    1,
    Math.floor(READ_WINDOW_BYTES / bytesPerFrame),
  );

  for (let frame = 0; frame < usableFrames; frame += framesPerWindow) {
    const windowFrames = Math.min(framesPerWindow, usableFrames - frame);
    const window = reader.readAt(
      dataOffset + frame * bytesPerFrame,
      windowFrames * bytesPerFrame,
    );
    if (window.length === 0) break;
    const view = new DataView(
      window.buffer,
      window.byteOffset,
      window.byteLength,
    );
    const readableFrames = Math.floor(window.length / bytesPerFrame);

    for (let i = 0; i < readableFrames; i++) {
      const bucket = Math.floor((frame + i) / framesPerBucket);
      if (bucket >= bucketCount) break;
      const sample = readSample(
        view,
        i * bytesPerFrame,
        bytesPerSample,
        audioFormat,
      );
      sumSquares[bucket] += sample * sample;
      counts[bucket] += 1;
    }
  }

  const peaks: number[] = [];
  for (let b = 0; b < bucketCount; b++) {
    peaks.push(counts[b] > 0 ? Math.sqrt(sumSquares[b] / counts[b]) : 0);
  }

  return normalizePeaks(peaks);
}

/**
 * Derives coarse peaks from raw byte magnitude for non-WAV (compressed) files,
 * streaming the file in bounded windows rather than buffering it whole.
 */
function deriveCompressedPeaks(
  reader: ByteReader,
  bucketCount: number,
): WaveformPeaks {
  const total = reader.size;
  const bytesPerBucket = Math.max(1, Math.floor(total / bucketCount));
  const usableBytes = Math.min(total, bytesPerBucket * bucketCount);

  const sums = new Float64Array(bucketCount);
  const counts = new Float64Array(bucketCount);

  for (let pos = 0; pos < usableBytes; pos += READ_WINDOW_BYTES) {
    const window = reader.readAt(
      pos,
      Math.min(READ_WINDOW_BYTES, usableBytes - pos),
    );
    if (window.length === 0) break;

    for (let i = 0; i < window.length; i++) {
      const bucket = Math.floor((pos + i) / bytesPerBucket);
      if (bucket >= bucketCount) break;
      sums[bucket] += window[i];
      counts[bucket] += 1;
    }
  }

  const peaks: number[] = [];
  for (let b = 0; b < bucketCount; b++) {
    peaks.push(counts[b] > 0 ? sums[b] / counts[b] / 255 : 0);
  }

  return normalizePeaks(peaks);
}

function normalizePeaks(peaks: number[]): WaveformPeaks {
  // Reduce rather than `Math.max(...peaks)`: the spread passes every element
  // as a call argument, which overflows the engine's argument limit for a
  // large bucketCount. `!(max > 0)` also catches the -Infinity an empty array
  // reduces to (and any NaN), where `max === 0` alone would let it through.
  const max = peaks.reduce((m, p) => (p > m ? p : m), -Infinity);
  if (!(max > 0)) return peaks.map(() => 0.1);
  return peaks.map((p) => Math.max(0.05, p / max));
}

/**
 * Platform-agnostic peak extraction: try to decode the bytes as WAV; on any
 * unsupported/compressed format fall back to coarse byte-magnitude peaks.
 * Both platform analyzers (native file handle, web ArrayBuffer) feed their
 * {@link ByteReader} through here, so the `WaveformPeaks` output — bucket
 * count, normalization, shape — is identical everywhere.
 */
export function computePeaks(
  reader: ByteReader,
  bucketCount: number = DEFAULT_BUCKET_COUNT,
): WaveformPeaks {
  const wavPeaks = parseWavPeaks(reader, bucketCount);
  if (wavPeaks) return wavPeaks;

  return deriveCompressedPeaks(reader, bucketCount);
}

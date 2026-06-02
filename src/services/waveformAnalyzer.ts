import { File, FileMode } from 'expo-file-system';

import { WaveformPeaks } from '../types';

const DEFAULT_BUCKET_COUNT = 200;
const WAV_HEADER_RIFF = 0x52494646;
const WAV_FORMAT_CHUNK = 0x666d7420;
const WAV_DATA_CHUNK = 0x64617461;

// `fmt ` chunk `audioFormat` codes we know how to decode. Anything else
// (ADPCM, mu-law, WAVE_FORMAT_EXTENSIBLE, etc.) falls back to byte derivation.
const WAV_AUDIO_FORMAT_PCM = 1;
const WAV_AUDIO_FORMAT_IEEE_FLOAT = 3;

// Size of each streamed read window. Bounds peak memory to this plus the
// (tiny) peaks array, instead of buffering the entire file at once.
const READ_WINDOW_BYTES = 256 * 1024;

/**
 * Random-access byte source over a file. Implementations read on demand so
 * callers never hold the whole file in memory at once.
 */
interface ByteReader {
  readonly size: number;
  /**
   * Reads up to `length` bytes starting at `offset`. May return fewer bytes
   * than requested only when the end of the file is reached.
   */
  readAt(offset: number, length: number): Uint8Array;
}

/** Wraps an expo-file-system `FileHandle` as a seekable {@link ByteReader}. */
function createHandleReader(
  handle: { offset: number | null; readBytes: (length: number) => Uint8Array },
  size: number,
): ByteReader {
  return {
    size,
    readAt(offset: number, length: number): Uint8Array {
      const available = Math.max(0, Math.min(length, size - offset));
      const out = new Uint8Array(available);
      let read = 0;
      handle.offset = offset;
      // readBytes can return short chunks; loop until satisfied or at EOF.
      while (read < available) {
        const chunk = handle.readBytes(available - read);
        if (chunk.length === 0) break;
        out.set(chunk, read);
        read += chunk.length;
      }
      return read === out.length ? out : out.subarray(0, read);
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
  if (audioFormat === WAV_AUDIO_FORMAT_IEEE_FLOAT) {
    // 32-bit IEEE float samples are already in [-1, 1]; reading their bytes
    // as an Int32 (the legacy path) yields garbage, so decode as float.
    return bytesPerSample === 4 ? view.getFloat32(byteOffset, true) : 0;
  }
  if (bytesPerSample === 2) {
    return view.getInt16(byteOffset, true) / 32768;
  }
  if (bytesPerSample === 1) {
    return (view.getUint8(byteOffset) - 128) / 128;
  }
  if (bytesPerSample === 4) {
    return view.getInt32(byteOffset, true) / 2147483648;
  }
  return 0;
}

/**
 * Whether {@link readSample} can decode this `(audioFormat, byte-width)` pair.
 * Unsupported combinations route to the compressed byte-derivation fallback.
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

type WavDataLayout = {
  dataOffset: number;
  dataSize: number;
  bytesPerSample: number;
  bytesPerFrame: number;
  audioFormat: number;
};

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
  if (!isSupportedWavFormat(audioFormat, bytesPerSample)) return null;
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
  const max = Math.max(...peaks);
  if (max === 0) return peaks.map(() => 0.1);
  return peaks.map((p) => Math.max(0.05, p / max));
}

export async function extractPeaks(
  uri: string,
  bucketCount: number = DEFAULT_BUCKET_COUNT,
): Promise<WaveformPeaks> {
  const file = new File(uri);
  const handle = file.open(FileMode.ReadOnly);

  try {
    const reader = createHandleReader(handle, file.size);

    const wavPeaks = parseWavPeaks(reader, bucketCount);
    if (wavPeaks) return wavPeaks;

    return deriveCompressedPeaks(reader, bucketCount);
  } finally {
    handle.close();
  }
}

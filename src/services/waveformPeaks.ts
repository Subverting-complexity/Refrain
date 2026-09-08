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
 * How much of each bucket is actually examined once a bucket grows past the
 * point where reading all of it is worth the wait.
 *
 * Every path below used to touch every byte of the file: the compressed
 * derivation ran a divide and an add per byte, and the WAV parser a `DataView`
 * read per frame. That is fine on a desktop engine and not on Hermes, where the
 * same loops run interpreted — and it is entirely synchronous, so the whole
 * app is frozen for the duration, including the callbacks that tell the player
 * its audio has finished loading. A long track therefore looked like slow
 * *audio* loading, which is not where the time was going at all.
 *
 * The work is now bounded: whatever the file's length, a bucket contributes at
 * most `SAMPLE_WINDOWS_PER_BUCKET` reads of a fixed size. For the default two
 * hundred buckets that is under two megabytes examined rather than the whole
 * file, and it does not grow with the track.
 *
 * The sample is taken as several windows spread across the bucket rather than
 * one window in the middle, because a bucket of a real track is a second or
 * more of music: a single window would report whatever happened to be at that
 * instant, and the drawn envelope would be noise rather than a quieter version
 * of the signal. Spreading the reads keeps each bar an average of its own span.
 *
 * A bucket small enough to read whole still is, exactly as before — which is
 * every file short enough for the exact scan to be cheap.
 */
const SAMPLE_WINDOWS_PER_BUCKET = 4;
const SAMPLE_FRAMES_PER_WINDOW = 512;
const SAMPLE_BYTES_PER_WINDOW = 2048;

/**
 * The offsets of the sample windows inside one bucket, in whatever unit the
 * caller counts in (frames for WAV, bytes for compressed audio).
 *
 * Windows are spread evenly and each sits at the start of its own share, so
 * together they cover the bucket without overlapping and without either end
 * being favoured.
 */
function sampleOffsets(spanUnits: number, windowUnits: number): number[] {
  const share = Math.floor(spanUnits / SAMPLE_WINDOWS_PER_BUCKET);
  const offsets: number[] = [];
  for (let i = 0; i < SAMPLE_WINDOWS_PER_BUCKET; i++) {
    offsets.push(i * share + Math.floor((share - windowUnits) / 2));
  }
  return offsets;
}

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
 * RMS peaks for a WAV file whose buckets are too long to read whole.
 *
 * Each bucket is measured from a few short windows spread across it rather than
 * from every frame in it — see `SAMPLE_WINDOWS_PER_BUCKET`. A bucket of
 * constant amplitude gives exactly the figure the full scan would; one that
 * varies gives an estimate of it, which is all a bar three pixels wide can
 * show.
 */
function sampleWavPeaks(
  reader: ByteReader,
  bucketCount: number,
  layout: WavDataLayout,
  framesPerBucket: number,
): WaveformPeaks {
  const { dataOffset, bytesPerSample, bytesPerFrame, audioFormat } = layout;
  const peaks: number[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const bucketFirstFrame = bucket * framesPerBucket;
    let sumSquares = 0;
    let count = 0;

    for (const offset of sampleOffsets(
      framesPerBucket,
      SAMPLE_FRAMES_PER_WINDOW,
    )) {
      const firstFrame = bucketFirstFrame + Math.max(0, offset);
      const window = reader.readAt(
        dataOffset + firstFrame * bytesPerFrame,
        SAMPLE_FRAMES_PER_WINDOW * bytesPerFrame,
      );
      if (window.length === 0) continue;
      const view = new DataView(
        window.buffer,
        window.byteOffset,
        window.byteLength,
      );
      const frames = Math.floor(window.length / bytesPerFrame);
      for (let i = 0; i < frames; i++) {
        const sample = readSample(
          view,
          i * bytesPerFrame,
          bytesPerSample,
          audioFormat,
        );
        sumSquares += sample * sample;
        count += 1;
      }
    }

    peaks.push(count > 0 ? Math.sqrt(sumSquares / count) : 0);
  }

  return normalizePeaks(peaks);
}

/**
 * Computes RMS peaks for a WAV file by streaming the data region in bounded
 * windows. Frames are assigned to buckets exactly as a single-pass scan would,
 * so peak values match a full-buffer computation.
 *
 * That exact scan is kept for every file short enough to afford it, and is what
 * the format tests measure. Past that length the buckets are sampled instead;
 * see `sampleWavPeaks`.
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

  if (framesPerBucket > SAMPLE_WINDOWS_PER_BUCKET * SAMPLE_FRAMES_PER_WINDOW) {
    return sampleWavPeaks(reader, bucketCount, layout, framesPerBucket);
  }

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
 * Byte-magnitude peaks for a compressed file whose buckets are too long to read
 * whole. The counterpart of `sampleWavPeaks`, and for the same reason: this is
 * the path almost every real track takes, because almost every real track is an
 * MP3 of more than a couple of megabytes.
 */
function sampleCompressedPeaks(
  reader: ByteReader,
  bucketCount: number,
  bytesPerBucket: number,
): WaveformPeaks {
  const peaks: number[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const bucketStart = bucket * bytesPerBucket;
    let sum = 0;
    let count = 0;

    for (const offset of sampleOffsets(
      bytesPerBucket,
      SAMPLE_BYTES_PER_WINDOW,
    )) {
      const window = reader.readAt(
        bucketStart + Math.max(0, offset),
        SAMPLE_BYTES_PER_WINDOW,
      );
      for (let i = 0; i < window.length; i++) {
        sum += window[i];
        count += 1;
      }
    }

    peaks.push(count > 0 ? sum / count / 255 : 0);
  }

  return normalizePeaks(peaks);
}

/**
 * Derives coarse peaks from raw byte magnitude for non-WAV (compressed) files,
 * streaming the file in bounded windows rather than buffering it whole.
 *
 * As with the WAV path, the exact scan is kept for files short enough to afford
 * it and the buckets are sampled beyond that; see `sampleCompressedPeaks`.
 */
function deriveCompressedPeaks(
  reader: ByteReader,
  bucketCount: number,
): WaveformPeaks {
  const total = reader.size;
  const bytesPerBucket = Math.max(1, Math.floor(total / bucketCount));
  const usableBytes = Math.min(total, bytesPerBucket * bucketCount);

  if (bytesPerBucket > SAMPLE_WINDOWS_PER_BUCKET * SAMPLE_BYTES_PER_WINDOW) {
    return sampleCompressedPeaks(reader, bucketCount, bytesPerBucket);
  }

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

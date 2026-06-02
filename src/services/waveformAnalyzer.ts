import { File, FileMode, type FileHandle } from 'expo-file-system';

import { WaveformPeaks } from '../types';

const DEFAULT_BUCKET_COUNT = 200;
const WAV_HEADER_RIFF = 0x52494646;
const WAV_FORMAT_CHUNK = 0x666d7420;
const WAV_DATA_CHUNK = 0x64617461;

/**
 * Size of the streaming window in bytes. The file is read in chunks of at most
 * this size so peak memory stays bounded regardless of file length.
 */
const READ_WINDOW = 256 * 1024;

/**
 * A bounded, seekable byte source. `readAt` returns up to `length` bytes
 * starting at `offset`; it may return fewer at end-of-file but never more.
 * This abstraction lets the parse/derive logic stream without depending on a
 * native file handle, keeping both unit-testable with an in-memory reader.
 */
interface ByteReader {
  size: number;
  readAt(offset: number, length: number): Uint8Array;
}

function createHandleReader(handle: FileHandle, size: number): ByteReader {
  return {
    size,
    readAt(offset, length) {
      handle.offset = offset;
      const out = new Uint8Array(length);
      let filled = 0;
      // readBytes may return a short read; loop until satisfied or EOF.
      while (filled < length) {
        const chunk = handle.readBytes(length - filled);
        if (chunk.length === 0) break;
        out.set(chunk, filled);
        filled += chunk.length;
      }
      return filled === length ? out : out.subarray(0, filled);
    },
  };
}

/** Read exactly `length` bytes at `offset` as a DataView, or null if short. */
function readView(
  reader: ByteReader,
  offset: number,
  length: number,
): DataView | null {
  const bytes = reader.readAt(offset, length);
  if (bytes.length < length) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function parseWavPeaks(
  reader: ByteReader,
  bucketCount: number,
): WaveformPeaks | null {
  if (reader.size < 44) return null;

  const riff = readView(reader, 0, 12);
  if (!riff) return null;
  if (riff.getUint32(0, false) !== WAV_HEADER_RIFF) return null;

  let offset = 12;
  let bitsPerSample = 16;
  let numChannels = 1;
  let dataOffset = -1;
  let dataSize = 0;

  // Walk chunk headers with tiny reads — robust to any header layout without
  // assuming the whole header fits a single window.
  while (offset + 8 <= reader.size) {
    const header = readView(reader, offset, 8);
    if (!header) break;
    const chunkId = header.getUint32(0, false);
    const chunkSize = header.getUint32(4, true);

    if (chunkId === WAV_FORMAT_CHUNK) {
      const fmt = readView(reader, offset + 8, chunkSize);
      if (fmt && chunkSize >= 16) {
        numChannels = fmt.getUint16(2, true);
        bitsPerSample = fmt.getUint16(14, true);
      }
    } else if (chunkId === WAV_DATA_CHUNK) {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++;
  }

  if (dataOffset < 0 || dataSize === 0) return null;

  const bytesPerSample = bitsPerSample / 8;
  const bytesPerFrame = bytesPerSample * numChannels;
  const totalFrames = Math.floor(dataSize / bytesPerFrame);

  if (totalFrames === 0) return null;

  const framesPerBucket = Math.max(1, Math.floor(totalFrames / bucketCount));
  const sumSquares = new Float64Array(bucketCount);
  const counts = new Int32Array(bucketCount);

  // Stream the data region in frame-aligned windows. Each frame's first
  // channel sample is bucketed by floor(frameIndex / framesPerBucket); frames
  // past the last bucket are dropped (preserves the original remainder-drop).
  const framesPerWindow = Math.max(1, Math.floor(READ_WINDOW / bytesPerFrame));
  let frame = 0;
  while (frame < totalFrames) {
    const framesThisWindow = Math.min(framesPerWindow, totalFrames - frame);
    const chunk = reader.readAt(
      dataOffset + frame * bytesPerFrame,
      framesThisWindow * bytesPerFrame,
    );
    if (chunk.length === 0) break;
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const framesAvailable = Math.floor(chunk.length / bytesPerFrame);

    for (let i = 0; i < framesAvailable; i++) {
      const bucket = Math.floor((frame + i) / framesPerBucket);
      if (bucket >= bucketCount) continue;

      const bytePos = i * bytesPerFrame;
      let sample: number;
      if (bytesPerSample === 2) {
        sample = view.getInt16(bytePos, true) / 32768;
      } else if (bytesPerSample === 1) {
        sample = (view.getUint8(bytePos) - 128) / 128;
      } else if (bytesPerSample === 4) {
        sample = view.getInt32(bytePos, true) / 2147483648;
      } else {
        sample = 0;
      }

      sumSquares[bucket] += sample * sample;
      counts[bucket]++;
    }

    frame += framesAvailable;
    if (framesAvailable < framesThisWindow) break; // short read / EOF
  }

  const peaks: number[] = [];
  for (let b = 0; b < bucketCount; b++) {
    peaks.push(counts[b] > 0 ? Math.sqrt(sumSquares[b] / counts[b]) : 0);
  }

  return normalizePeaks(peaks);
}

function deriveCompressedPeaks(
  reader: ByteReader,
  bucketCount: number,
): WaveformPeaks {
  const size = reader.size;
  const bytesPerBucket = Math.max(1, Math.floor(size / bucketCount));
  const sums = new Float64Array(bucketCount);
  const counts = new Int32Array(bucketCount);

  // Stream the whole file, bucketing by global byte index; bytes past the last
  // bucket are dropped (preserves the original remainder-drop).
  let pos = 0;
  while (pos < size) {
    const chunk = reader.readAt(pos, Math.min(READ_WINDOW, size - pos));
    if (chunk.length === 0) break;
    for (let i = 0; i < chunk.length; i++) {
      const bucket = Math.floor((pos + i) / bytesPerBucket);
      if (bucket >= bucketCount) continue;
      sums[bucket] += chunk[i];
      counts[bucket]++;
    }
    pos += chunk.length;
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
    const size = handle.size ?? file.size;
    const reader = createHandleReader(handle, size);

    const wavPeaks = parseWavPeaks(reader, bucketCount);
    if (wavPeaks) return wavPeaks;

    return deriveCompressedPeaks(reader, bucketCount);
  } finally {
    handle.close();
  }
}

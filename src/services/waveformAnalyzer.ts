import { File } from 'expo-file-system';

import { WaveformPeaks } from '../types';

const DEFAULT_BUCKET_COUNT = 200;
const WAV_HEADER_RIFF = 0x52494646;
const WAV_FORMAT_CHUNK = 0x666d7420;
const WAV_DATA_CHUNK = 0x64617461;

function readUint32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function readUint16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32BE(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function parseWavPeaks(
  buffer: ArrayBuffer,
  bucketCount: number,
): WaveformPeaks | null {
  const view = new DataView(buffer);

  if (buffer.byteLength < 44) return null;
  if (readUint32BE(view, 0) !== WAV_HEADER_RIFF) return null;

  let offset = 12;
  let bitsPerSample = 16;
  let numChannels = 1;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readUint32BE(view, offset);
    const chunkSize = readUint32LE(view, offset + 4);

    if (chunkId === WAV_FORMAT_CHUNK) {
      numChannels = readUint16LE(view, offset + 10);
      bitsPerSample = readUint16LE(view, offset + 22);
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
  const peaks: number[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const startFrame = b * framesPerBucket;
    const endFrame = Math.min(startFrame + framesPerBucket, totalFrames);
    let sumSquares = 0;
    let count = 0;

    for (let f = startFrame; f < endFrame; f++) {
      const bytePos = dataOffset + f * bytesPerFrame;
      if (bytePos + bytesPerSample > buffer.byteLength) break;

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

      sumSquares += sample * sample;
      count++;
    }

    peaks.push(count > 0 ? Math.sqrt(sumSquares / count) : 0);
  }

  return normalizePeaks(peaks);
}

function deriveCompressedPeaks(
  buffer: ArrayBuffer,
  bucketCount: number,
): WaveformPeaks {
  const bytes = new Uint8Array(buffer);
  const bytesPerBucket = Math.max(1, Math.floor(bytes.length / bucketCount));
  const peaks: number[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const start = b * bytesPerBucket;
    const end = Math.min(start + bytesPerBucket, bytes.length);
    let sum = 0;
    let count = 0;

    for (let i = start; i < end; i++) {
      sum += bytes[i];
      count++;
    }

    peaks.push(count > 0 ? sum / count / 255 : 0);
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
  const buffer = await file.arrayBuffer();

  const wavPeaks = parseWavPeaks(buffer, bucketCount);
  if (wavPeaks) return wavPeaks;

  return deriveCompressedPeaks(buffer, bucketCount);
}

import { File, FileMode } from 'expo-file-system';

import {
  ByteReader,
  DEFAULT_BUCKET_COUNT,
  computePeaks,
} from './waveformPeaks';
import { WaveformPeaks } from '../types';

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

/**
 * Native peak extraction. Opens a random-access `expo-file-system` file handle
 * and streams it through the shared {@link computePeaks} core, so the whole
 * file is never buffered at once. The web platform uses `waveformAnalyzer.web`
 * instead, which has no native file handle.
 */
export async function extractPeaks(
  uri: string,
  bucketCount: number = DEFAULT_BUCKET_COUNT,
): Promise<WaveformPeaks> {
  const file = new File(uri);
  const handle = file.open(FileMode.ReadOnly);

  try {
    const reader = createHandleReader(handle, file.size);
    return computePeaks(reader, bucketCount);
  } finally {
    handle.close();
  }
}

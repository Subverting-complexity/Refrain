import {
  DEFAULT_BUCKET_COUNT,
  computePeaks,
  createBufferReader,
} from './waveformPeaks';
import { WaveformPeaks } from '../types';

/**
 * Web peak extraction. The browser has no native filesystem, so the audio
 * bytes are fetched whole from the `blob:` object URL produced by
 * `webBlobStore.web` (the same URL stored as `track.uri`) and wrapped in an
 * in-memory {@link createBufferReader}. The bytes then flow through the shared
 * {@link computePeaks} core, so WAV (PCM/float32) and compressed-format peaks
 * come out identical to the native path.
 *
 * `fetch` rejects on a missing/revoked URL; callers (`useWaveformData`)
 * already catch and fall back to empty peaks.
 */
export async function extractPeaks(
  uri: string,
  bucketCount: number = DEFAULT_BUCKET_COUNT,
): Promise<WaveformPeaks> {
  const response = await fetch(uri);
  // A non-OK response (404 page, error body) would otherwise flow its bytes
  // into the peak parser and render a garbage waveform. Throw instead so the
  // caller takes the same empty-peaks fallback as the native path.
  if (!response.ok) {
    throw new Error(`Failed to fetch audio for waveform: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const reader = createBufferReader(new Uint8Array(buffer));
  return computePeaks(reader, bucketCount);
}

import { useEffect, useRef } from 'react';

import { updateTrackDuration } from '../services/trackStore';
import { settle } from '../utils/settle';

/**
 * Write a track's measured duration back to the library the first time the
 * engine reports it, once per track.
 *
 * The duration is only known after the audio loads, so the library row starts
 * without it; this fills it in so the track list can show a length without
 * re-decoding. Persistence is best-effort — a failed write is retried on the
 * next duration update rather than surfaced.
 */
export function usePersistTrackDuration(
  trackId: string | null,
  durationMs: number,
): void {
  const persisted = useRef(false);

  // Reset the persist guard when the track changes so a reused component
  // instance persists the new track's measured duration instead of dropping
  // it. Declared before the persist effect so, on a trackId change, the reset
  // runs first and the new track persists in the same commit (#168).
  useEffect(() => {
    persisted.current = false;
  }, [trackId]);

  useEffect(() => {
    if (trackId && durationMs > 0 && !persisted.current) {
      // Optimistically guard against re-entry; clear the flag on failure so
      // the next durationMs update retries. `settle` covers both a native
      // synchronous throw and a web asynchronous rejection (the web store is
      // async), so the retry reset lives in one place.
      persisted.current = true;
      void settle(() => updateTrackDuration(trackId, durationMs)).catch(() => {
        persisted.current = false;
      });
    }
  }, [trackId, durationMs]);
}

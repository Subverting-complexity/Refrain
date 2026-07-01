import { useCallback, useState } from 'react';

import * as skipIntervalStore from '../services/skipIntervalStore';

/**
 * Manages the configurable skip-back/forward amount, persisted across reloads
 * and tracks via the skip-interval service (best-effort — a storage failure
 * falls back to the default and never throws). Returns the amount in seconds,
 * the matching millisecond delta, and a persisting setter. All validation and
 * persistence lives in the service; this hook is only the React state wiring.
 */
export function useSkipInterval() {
  // Hydrate the persisted amount once, in the lazy initializer, so the first
  // render already shows the stored value (no default-then-update flash) and we
  // avoid a synchronous setState in an effect. Reads are best-effort: a storage
  // failure falls back to the default and never throws.
  const [skipSeconds, setSkipSeconds] = useState(() => {
    try {
      return skipIntervalStore.getSkipSeconds();
    } catch {
      return skipIntervalStore.DEFAULT_SKIP_SECONDS;
    }
  });

  const updateSkipSeconds = useCallback((seconds: number) => {
    const next = skipIntervalStore.sanitize(seconds);
    setSkipSeconds(next);
    try {
      skipIntervalStore.setSkipSeconds(next);
    } catch {
      // Persistence is best-effort: a failed write must not break playback.
    }
  }, []);

  return {
    skipSeconds,
    skipMs: skipSeconds * 1000,
    setSkipSeconds: updateSkipSeconds,
  };
}

import { useCallback, useEffect, useState } from 'react';

import * as settingsStore from '../services/settingsStore';

const SKIP_SETTING_KEY = 'playback.skipSeconds';
const DEFAULT_SKIP_SECONDS = 5;

/** Selectable skip amounts (seconds) for the transport skip buttons. */
export const SKIP_PRESETS = [1, 3, 5, 10, 15, 30] as const;

function sanitize(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_SKIP_SECONDS;
  // Snap to a known preset so a corrupted/foreign stored value can't produce
  // an off-list amount the chips can't represent.
  return SKIP_PRESETS.includes(seconds as (typeof SKIP_PRESETS)[number])
    ? seconds
    : DEFAULT_SKIP_SECONDS;
}

/**
 * Read the persisted amount, snapped to a known preset. Best-effort: a storage
 * failure falls back to the default and never throws.
 */
function readPersistedSkipSeconds(): number {
  try {
    return sanitize(
      settingsStore.getNumber(SKIP_SETTING_KEY, DEFAULT_SKIP_SECONDS),
    );
  } catch {
    return DEFAULT_SKIP_SECONDS;
  }
}

/**
 * Manages the configurable skip-back/forward amount, persisted across reloads
 * and tracks via the shared settings store (best-effort — a storage failure
 * falls back to the default and never throws). Returns the amount in seconds,
 * the matching millisecond delta, and a persisting setter.
 */
export function useSkipInterval() {
  // Hydrate the persisted amount once, in the lazy initializer, so the first
  // render already shows the stored value (no default-then-update flash) and we
  // avoid a synchronous setState in an effect.
  const [skipSeconds, setSkipSeconds] = useState(readPersistedSkipSeconds);

  // On a cold web load the settings cache may still be empty when the lazy
  // seed above runs, so a persisted amount reads as the default 5s (#163).
  // Re-read once hydration resolves to reapply it. No-op on native, where
  // hydration is a resolved no-op and the seed was already correct.
  useEffect(() => {
    let cancelled = false;
    try {
      void Promise.resolve(settingsStore.hydrateSettings())
        .then(() => {
          if (!cancelled) setSkipSeconds(readPersistedSkipSeconds());
        })
        .catch(() => undefined);
    } catch {
      // Best-effort: the lazy seed above already holds a usable value.
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSkipSeconds = useCallback((seconds: number) => {
    const next = sanitize(seconds);
    setSkipSeconds(next);
    try {
      settingsStore.setNumber(SKIP_SETTING_KEY, next);
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

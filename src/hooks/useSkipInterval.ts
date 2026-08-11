import { useCallback } from 'react';

import {
  DEFAULT_SKIP_SECONDS,
  getSkipSeconds,
  sanitizeSkipSeconds,
  setSkipSeconds as persistSkipSeconds,
} from '../services/skipIntervalStore';
import { usePersistedSetting } from './usePersistedSetting';

export { SKIP_PRESETS } from '../services/skipIntervalStore';

const SKIP_SETTING = {
  read: getSkipSeconds,
  write: persistSkipSeconds,
  fallback: DEFAULT_SKIP_SECONDS,
};

/**
 * Manages the configurable skip-back/forward amount, persisted across reloads
 * and tracks. Validation and persistence live in `skipIntervalStore`; this hook
 * is only the React state wiring. Returns the amount in seconds, the matching
 * millisecond delta, and a persisting setter.
 */
export function useSkipInterval() {
  const [skipSeconds, setValue] = usePersistedSetting(SKIP_SETTING);

  // Snap here as well as in the store so state and storage never disagree: an
  // off-list amount must not sit in React state waiting for the next reload to
  // correct it.
  const setSkipSeconds = useCallback(
    (seconds: number) => setValue(sanitizeSkipSeconds(seconds)),
    [setValue],
  );

  return {
    skipSeconds,
    skipMs: skipSeconds * 1000,
    setSkipSeconds,
  };
}

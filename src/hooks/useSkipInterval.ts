import { useCallback, useMemo } from 'react';

import {
  DEFAULT_SKIP_PREFERENCE,
  formatSkipLabel,
  getSkipPreference,
  sanitizeSkipMode,
  sanitizeSkipSeconds,
  setSkipPreference,
  SkipPreference,
} from '../services/skipIntervalStore';
import { usePersistedSetting } from './usePersistedSetting';

export {
  formatSkipLabel,
  SKIP_PRESETS,
  type SkipMode,
  type SkipPreference,
} from '../services/skipIntervalStore';

const SKIP_SETTING = {
  read: getSkipPreference,
  write: setSkipPreference,
  fallback: DEFAULT_SKIP_PREFERENCE,
};

/**
 * Describe what a skip button will do, for a screen reader: the button's own
 * label has to carry the current setting, because the icon is identical in
 * every mode.
 */
export function describeSkip(
  preference: SkipPreference,
  direction: 'back' | 'forward',
): string {
  if (preference.mode === 'full') {
    return direction === 'back' ? 'Skip to start' : 'Skip to end';
  }
  const amount = formatSkipLabel(preference.seconds);
  return direction === 'back'
    ? `Skip back ${amount}`
    : `Skip forward ${amount}`;
}

/**
 * Manages the configurable skip-back/forward preference, persisted across
 * reloads and tracks. Validation and persistence live in `skipIntervalStore`;
 * this hook is only the React state wiring.
 *
 * The engine reads the same store directly when it performs a skip, so this
 * hook exists to drive the settings UI and the transport's accessibility
 * labels — not to hand a delta to the transport. That keeps the player screen
 * and the lock screen on one source of truth.
 */
export function useSkipInterval() {
  const [preference, setValue] = usePersistedSetting(SKIP_SETTING);

  // Snap here as well as in the store so state and storage never disagree: an
  // off-list amount must not sit in React state waiting for the next reload to
  // correct it.
  const setPreference = useCallback(
    (next: SkipPreference) =>
      setValue({
        mode: sanitizeSkipMode(next.mode),
        seconds: sanitizeSkipSeconds(next.seconds),
      }),
    [setValue],
  );

  const labels = useMemo(
    () => ({
      skipBackLabel: describeSkip(preference, 'back'),
      skipForwardLabel: describeSkip(preference, 'forward'),
    }),
    [preference],
  );

  return {
    skipPreference: preference,
    setSkipPreference: setPreference,
    ...labels,
  };
}

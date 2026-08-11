import * as settingsStore from './settingsStore';

/**
 * Persisted skip amount for the transport skip-back/forward buttons, backed by
 * the generic settings store (the platform-resolved `settingsStore` /
 * `settingsStore.web`), so it survives reload and track changes exactly like
 * the saved playback volume and the snippet-preview preference.
 *
 * Reads and writes propagate storage failures to the caller, matching
 * `snippetPreviewStore`. Best-effort recovery is the calling hook's job.
 */

const SKIP_SETTING_KEY = 'playback.skipSeconds';

/** Skip amount used when nothing usable is stored. */
export const DEFAULT_SKIP_SECONDS = 5;

/** Selectable skip amounts (seconds) for the transport skip buttons. */
export const SKIP_PRESETS = [1, 3, 5, 10, 15, 30] as const;

/** A skip amount the chips can represent. */
export type SkipPreset = (typeof SKIP_PRESETS)[number];

function isPreset(seconds: number): seconds is SkipPreset {
  return (SKIP_PRESETS as readonly number[]).includes(seconds);
}

/**
 * Snaps any number onto a known preset so a corrupted, foreign, or off-list
 * stored value can't produce an amount the chips have no chip for.
 *
 * The preset list is the whole contract: every entry is finite and positive,
 * so NaN, Infinity, and non-positive values fail the membership test and land
 * on the default without needing a separate range check.
 */
export function sanitizeSkipSeconds(seconds: number): SkipPreset {
  return isPreset(seconds) ? seconds : DEFAULT_SKIP_SECONDS;
}

/** The persisted skip amount, snapped to a known preset. */
export function getSkipSeconds(): SkipPreset {
  return sanitizeSkipSeconds(
    settingsStore.getNumber(SKIP_SETTING_KEY, DEFAULT_SKIP_SECONDS),
  );
}

/** Persist the skip amount, snapped to a known preset. */
export function setSkipSeconds(seconds: number): void {
  settingsStore.setNumber(SKIP_SETTING_KEY, sanitizeSkipSeconds(seconds));
}

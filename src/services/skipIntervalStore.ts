import * as settingsStore from './settingsStore';

/**
 * Persisted preference for the transport skip-back/forward buttons, backed by
 * the generic settings store (the platform-resolved `settingsStore` /
 * `settingsStore.web`), so it survives reload and track changes exactly like
 * the saved playback volume and the snippet-preview preference.
 *
 * The preference has two parts:
 *
 *   - `mode` — jump by a fixed interval, or all the way to the edge of the
 *     active region ("full");
 *   - `seconds` — the interval used in `interval` mode. It is kept while in
 *     `full` mode too, so switching back restores the amount the user last
 *     picked rather than resetting to the default.
 *
 * The two are stored under separate keys so an install predating `full` mode
 * keeps its saved amount: the missing mode key simply reads as `interval`.
 *
 * Reads and writes propagate storage failures to the caller, matching
 * `snippetPreviewStore`. Best-effort recovery is the calling hook's job.
 */

const SKIP_SETTING_KEY = 'playback.skipSeconds';
const SKIP_MODE_KEY = 'playback.skipMode';

/** Skip amount used when nothing usable is stored. */
export const DEFAULT_SKIP_SECONDS = 5;

/**
 * Selectable skip amounts (seconds) for the transport skip buttons. Runs from a
 * one-second nudge up to five minutes so the same control covers both picking
 * apart a bar and moving around a long take.
 */
export const SKIP_PRESETS = [1, 3, 5, 10, 15, 30, 60, 300] as const;

/** A skip amount the chips can represent. */
export type SkipPreset = (typeof SKIP_PRESETS)[number];

/**
 * How the skip buttons move the playhead: by a fixed interval, or straight to
 * the edge of the active A/B region (the whole track when no region is set).
 */
export type SkipMode = 'interval' | 'full';

export interface SkipPreference {
  mode: SkipMode;
  seconds: SkipPreset;
}

/** The preference used when nothing usable is stored. */
export const DEFAULT_SKIP_PREFERENCE: SkipPreference = {
  mode: 'interval',
  seconds: DEFAULT_SKIP_SECONDS,
};

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

/** Snaps any stored string onto a known mode; anything unrecognised is `interval`. */
export function sanitizeSkipMode(mode: string | null): SkipMode {
  return mode === 'full' ? 'full' : 'interval';
}

/** Render a preset as a chip label: seconds below a minute, whole minutes above. */
export function formatSkipLabel(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${seconds / 60}m`;
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

/** The persisted preference, with both parts snapped to known values. */
export function getSkipPreference(): SkipPreference {
  return {
    mode: sanitizeSkipMode(settingsStore.getSetting(SKIP_MODE_KEY)),
    seconds: getSkipSeconds(),
  };
}

/**
 * Persist the preference. The amount is written in both modes so a later switch
 * back to `interval` restores it rather than falling back to the default.
 */
export function setSkipPreference(preference: SkipPreference): void {
  settingsStore.setSetting(SKIP_MODE_KEY, sanitizeSkipMode(preference.mode));
  setSkipSeconds(preference.seconds);
}

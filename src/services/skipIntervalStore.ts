import * as settingsStore from './settingsStore';

/**
 * Domain logic for the configurable skip-back/forward amount used by the
 * transport skip buttons. Owns the selectable presets, the default, the
 * validation/normalization rules, and the read/persist over the shared
 * settings store. Kept out of the React hook so the rules are testable without
 * rendering and reusable by any caller that reads the same value.
 */

const SKIP_SETTING_KEY = 'playback.skipSeconds';

/** The amount used when nothing valid is stored. */
export const DEFAULT_SKIP_SECONDS = 5;

/** Selectable skip amounts (seconds) for the transport skip buttons. */
export const SKIP_PRESETS = [1, 3, 5, 10, 15, 30] as const;

/**
 * Normalize a skip amount to a usable value: reject non-finite or
 * non-positive input, and snap anything off the preset list back to the
 * default so a corrupted or foreign stored value can't produce an amount the
 * chips can't represent.
 */
export function sanitize(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_SKIP_SECONDS;
  return SKIP_PRESETS.includes(seconds as (typeof SKIP_PRESETS)[number])
    ? seconds
    : DEFAULT_SKIP_SECONDS;
}

/**
 * Read the persisted skip amount and normalize it. May throw if the
 * underlying store throws; callers that need a best-effort read should guard
 * this and fall back to {@link DEFAULT_SKIP_SECONDS}.
 */
export function getSkipSeconds(): number {
  return sanitize(
    settingsStore.getNumber(SKIP_SETTING_KEY, DEFAULT_SKIP_SECONDS),
  );
}

/**
 * Normalize and persist a skip amount, returning the value actually stored.
 * May throw if the underlying store throws; callers that treat persistence as
 * best-effort should guard this.
 */
export function setSkipSeconds(seconds: number): number {
  const next = sanitize(seconds);
  settingsStore.setNumber(SKIP_SETTING_KEY, next);
  return next;
}

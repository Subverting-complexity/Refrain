import * as settingsStore from './settingsStore';
import {
  CountdownConfig,
  CountdownDuration,
  CountdownMode,
  CountdownRepeat,
} from '../types';

/**
 * Persisted preference for the count-in (the lead-in that plays before the
 * loop starts), backed by the generic settings store (the platform-resolved
 * `settingsStore` / `settingsStore.web`), so it survives leaving the player
 * screen, changing track, and reloading — exactly like the saved playback
 * volume, the skip preference and the snippet-preview preference.
 *
 * Until this existed the count-in was the one preference the player held in
 * plain component state, so every return to the player screen silently reset
 * a configured lead-in back to off. For a practice looper the count-in is
 * part of the routine, not a per-visit choice.
 *
 * The config has four parts, each under its own key:
 *
 *   - `enabled` — whether a count-in runs at all;
 *   - `mode` — a silent lead-in or an audible metronome;
 *   - `duration` — how long the lead-in lasts, either a number of seconds or
 *     a number of bars;
 *   - `repeat` — before the first play only, or before every loop pass.
 *
 * Separate keys (rather than one serialised blob) match `skipIntervalStore`
 * and buy the same two things: an install that predates any one key keeps
 * everything else it had, and the seconds and bars amounts are both retained
 * across a duration-type switch, so going back restores the amount last
 * picked instead of the default.
 *
 * Reads and writes propagate storage failures to the caller, matching the
 * other preference stores. Best-effort recovery is the calling hook's job.
 */

const ENABLED_KEY = 'countdown.enabled';
const MODE_KEY = 'countdown.mode';
const DURATION_TYPE_KEY = 'countdown.durationType';
const SECONDS_KEY = 'countdown.seconds';
const BARS_KEY = 'countdown.bars';
const REPEAT_KEY = 'countdown.repeat';

/**
 * Selectable lead-in lengths in seconds, mirroring the chips in
 * `CountdownSettings`. Seconds read more clearly than musical bars for a
 * practice lead-in and avoid coupling the duration to a tempo.
 */
export const COUNTDOWN_SECONDS_PRESETS = [1, 3, 5, 10, 15, 30] as const;

/** A lead-in length in seconds that the chips can represent. */
export type CountdownSecondsPreset = (typeof COUNTDOWN_SECONDS_PRESETS)[number];

/** Selectable bar counts, matching the `bars` arm of {@link CountdownDuration}. */
export const COUNTDOWN_BARS_PRESETS = [1, 2, 4] as const;

/** A bar count the duration type can represent. */
export type CountdownBarsPreset = (typeof COUNTDOWN_BARS_PRESETS)[number];

/** Lead-in length used when nothing usable is stored. */
export const DEFAULT_COUNTDOWN_SECONDS: CountdownSecondsPreset = 3;

/** Bar count used when a bars duration is stored without a usable amount. */
export const DEFAULT_COUNTDOWN_BARS: CountdownBarsPreset = 1;

/** The config used when nothing usable is stored. */
export const DEFAULT_COUNTDOWN_CONFIG: CountdownConfig = {
  enabled: false,
  mode: 'silent',
  duration: { type: 'seconds', seconds: DEFAULT_COUNTDOWN_SECONDS },
  repeat: 'once',
};

/**
 * Snaps any stored string onto a known mode; anything unrecognised is
 * `silent`, the quieter of the two and so the safer thing to fall back to.
 */
export function sanitizeCountdownMode(mode: string | null): CountdownMode {
  return mode === 'metronome' ? 'metronome' : 'silent';
}

/** Snaps any stored string onto a known repeat; anything unrecognised is `once`. */
export function sanitizeCountdownRepeat(
  repeat: string | null,
): CountdownRepeat {
  return repeat === 'everyLoop' ? 'everyLoop' : 'once';
}

/**
 * Snaps any number onto a known seconds preset.
 *
 * The preset list is the whole contract: every entry is finite and positive,
 * so NaN, Infinity and non-positive values all fail the membership test and
 * land on the default without needing a separate range check.
 */
export function sanitizeCountdownSeconds(
  seconds: number,
): CountdownSecondsPreset {
  return (COUNTDOWN_SECONDS_PRESETS as readonly number[]).includes(seconds)
    ? (seconds as CountdownSecondsPreset)
    : DEFAULT_COUNTDOWN_SECONDS;
}

/** Snaps any number onto a known bar count, on the same reasoning as seconds. */
export function sanitizeCountdownBars(bars: number): CountdownBarsPreset {
  return (COUNTDOWN_BARS_PRESETS as readonly number[]).includes(bars)
    ? (bars as CountdownBarsPreset)
    : DEFAULT_COUNTDOWN_BARS;
}

/**
 * Snaps a duration onto known values, keeping its type. An unrecognised type
 * cannot occur through the type system but can through storage, and falls
 * back to the default seconds duration.
 */
export function sanitizeCountdownDuration(
  duration: CountdownDuration,
): CountdownDuration {
  if (duration.type === 'bars') {
    return { type: 'bars', bars: sanitizeCountdownBars(duration.bars) };
  }
  return {
    type: 'seconds',
    seconds: sanitizeCountdownSeconds(duration.seconds),
  };
}

/** Snaps a whole config onto known values. */
export function sanitizeCountdownConfig(
  config: CountdownConfig,
): CountdownConfig {
  return {
    enabled: config.enabled,
    mode: sanitizeCountdownMode(config.mode),
    duration: sanitizeCountdownDuration(config.duration),
    repeat: sanitizeCountdownRepeat(config.repeat),
  };
}

/**
 * The stored duration, with its amount snapped to a known value.
 *
 * The type key decides which amount is live; both amounts are read from their
 * own key, so the one not in use keeps whatever it was last set to.
 */
function getCountdownDuration(): CountdownDuration {
  const type = settingsStore.getSetting(DURATION_TYPE_KEY);
  if (type === 'bars') {
    return {
      type: 'bars',
      bars: sanitizeCountdownBars(
        settingsStore.getNumber(BARS_KEY, DEFAULT_COUNTDOWN_BARS),
      ),
    };
  }
  return {
    type: 'seconds',
    seconds: sanitizeCountdownSeconds(
      settingsStore.getNumber(SECONDS_KEY, DEFAULT_COUNTDOWN_SECONDS),
    ),
  };
}

/** The persisted count-in config, with every part snapped to known values. */
export function getCountdownConfig(): CountdownConfig {
  return {
    enabled: settingsStore.getBoolean(
      ENABLED_KEY,
      DEFAULT_COUNTDOWN_CONFIG.enabled,
    ),
    mode: sanitizeCountdownMode(settingsStore.getSetting(MODE_KEY)),
    duration: getCountdownDuration(),
    repeat: sanitizeCountdownRepeat(settingsStore.getSetting(REPEAT_KEY)),
  };
}

/**
 * Persist the count-in config.
 *
 * Only the amount belonging to the duration type being written is touched, so
 * the other one survives a switch and is restored on switching back — the same
 * reasoning as the skip preference keeping its interval while in `full` mode.
 */
export function setCountdownConfig(config: CountdownConfig): void {
  const sanitized = sanitizeCountdownConfig(config);
  settingsStore.setBoolean(ENABLED_KEY, sanitized.enabled);
  settingsStore.setSetting(MODE_KEY, sanitized.mode);
  settingsStore.setSetting(DURATION_TYPE_KEY, sanitized.duration.type);
  if (sanitized.duration.type === 'bars') {
    settingsStore.setNumber(BARS_KEY, sanitized.duration.bars);
  } else {
    settingsStore.setNumber(SECONDS_KEY, sanitized.duration.seconds);
  }
  settingsStore.setSetting(REPEAT_KEY, sanitized.repeat);
}

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
 * The config has four parts, spread over six keys because `duration` needs
 * three of them:
 *
 *   - `enabled` — whether a count-in runs at all;
 *   - `mode` — a silent lead-in or an audible metronome;
 *   - `duration` — how long the lead-in lasts. The type key says whether
 *     seconds or bars are in force, and each amount has its own key;
 *   - `repeat` — before the first play only, or before every loop pass.
 *
 * Flat scalar keys rather than one serialised blob, because that is how every
 * other preference in the app is stored (`skipIntervalStore`,
 * `snippetPreviewStore`, `themeStore`) and `settingsStore` has no JSON helper.
 * Note this store gains nothing from the forward-compatibility argument that
 * motivated the split in `skipIntervalStore`: the count-in has never been
 * persisted before, so no install exists with a partial set of `countdown.*`
 * keys and there is nothing to migrate. The keys are split for consistency,
 * and for the amount-retention below.
 *
 * Giving seconds and bars their own keys means switching duration type and
 * back restores the amount last picked rather than the default — the same
 * reasoning as the skip preference keeping its interval while in `full` mode.
 * The `bars` arm is part of the {@link CountdownDuration} model and the
 * count-in engine honours it, but no control currently offers it, so that
 * path is carried for the model rather than exercised by the UI.
 *
 * Because the parts are written separately, a storage failure part-way
 * through `setCountdownConfig` can leave an older value alongside newer ones.
 * Every part is independently sanitized on read, so the result is a valid
 * config with some fields stale rather than a corrupt one, and the next
 * successful write repairs it.
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
 * Selectable lead-in lengths in seconds, and the whole contract for what
 * counts as a valid one. `CountdownSettings` builds its Length chips from
 * this list, so the control and the sanitizer below cannot drift: a length
 * offered on screen is by construction a length that survives a write.
 */
export const COUNTDOWN_SECONDS_PRESETS = [1, 3, 5, 10, 15, 30] as const;

/** A lead-in length in seconds that the chips can represent. */
export type CountdownSecondsPreset = (typeof COUNTDOWN_SECONDS_PRESETS)[number];

/** Selectable bar counts, matching the `bars` arm of {@link CountdownDuration}. */
const COUNTDOWN_BARS_PRESETS = [1, 2, 4] as const;

/** A bar count the duration type can represent. */
type CountdownBarsPreset = (typeof COUNTDOWN_BARS_PRESETS)[number];

/** Lead-in length used when nothing usable is stored. */
const DEFAULT_COUNTDOWN_SECONDS: CountdownSecondsPreset = 3;

/** Bar count used when a bars duration is stored without a usable amount. */
const DEFAULT_COUNTDOWN_BARS: CountdownBarsPreset = 1;

/**
 * The config used when nothing usable is stored. Frozen because it is handed
 * out as the shared fallback for every reader, so a caller that mutated what
 * it received would change the default for the rest of the session.
 */
export const DEFAULT_COUNTDOWN_CONFIG: CountdownConfig = Object.freeze({
  enabled: false,
  mode: 'silent',
  duration: Object.freeze({
    type: 'seconds',
    seconds: DEFAULT_COUNTDOWN_SECONDS,
  }),
  repeat: 'once',
} as const);

// The two string sanitizers below are the same shape as each other and stay
// apart on purpose: each one's comment names the safe fallback and says why,
// and a generic two-member union-snapper would have nowhere to put that.

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
 * Builds a sanitizer that snaps any number onto one of `presets`, falling
 * back to `fallback`.
 *
 * The preset list is the whole contract: every entry is finite and positive,
 * so NaN, Infinity and non-positive values all fail the membership test and
 * land on the fallback without needing a separate range check.
 */
function snapToPreset<T extends number>(
  presets: readonly T[],
  fallback: T,
): (value: number) => T {
  return (value) =>
    (presets as readonly number[]).includes(value) ? (value as T) : fallback;
}

/** Snaps any number onto a known seconds preset. */
export const sanitizeCountdownSeconds = snapToPreset(
  COUNTDOWN_SECONDS_PRESETS,
  DEFAULT_COUNTDOWN_SECONDS,
);

/** Snaps any number onto a known bar count. */
export const sanitizeCountdownBars = snapToPreset(
  COUNTDOWN_BARS_PRESETS,
  DEFAULT_COUNTDOWN_BARS,
);

/**
 * A duration as it comes back from storage: the right shape, but with the
 * amount still unchecked. Both amounts are plain numbers here because a
 * stored key can hold anything, which is what the sanitizer below is for.
 * Every {@link CountdownDuration} is already one of these, so callers holding
 * a checked duration can pass it straight through.
 */
type StoredCountdownDuration =
  | { type: 'bars'; bars: number }
  | { type: 'seconds'; seconds: number };

/**
 * Snaps a duration onto known values, keeping its type. An unrecognised type
 * cannot occur through the type system but can through storage, and falls
 * back to the default seconds duration.
 */
export function sanitizeCountdownDuration(
  duration: StoredCountdownDuration,
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
  const stored: StoredCountdownDuration =
    settingsStore.getSetting(DURATION_TYPE_KEY) === 'bars'
      ? {
          type: 'bars',
          bars: settingsStore.getNumber(BARS_KEY, DEFAULT_COUNTDOWN_BARS),
        }
      : {
          type: 'seconds',
          seconds: settingsStore.getNumber(
            SECONDS_KEY,
            DEFAULT_COUNTDOWN_SECONDS,
          ),
        };
  return sanitizeCountdownDuration(stored);
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
  // This branch stays: the two arms write to different keys, and writing only
  // the one in force is what lets the other amount survive a type switch.
  if (sanitized.duration.type === 'bars') {
    settingsStore.setNumber(BARS_KEY, sanitized.duration.bars);
  } else {
    settingsStore.setNumber(SECONDS_KEY, sanitized.duration.seconds);
  }
  settingsStore.setSetting(REPEAT_KEY, sanitized.repeat);
}

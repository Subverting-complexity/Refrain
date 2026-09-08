import { useMemo } from 'react';
import { SharedValue, useSharedValue } from 'react-native-reanimated';

/**
 * What an in-flight waveform gesture is moving, as a number.
 *
 * A number rather than a string because the UI thread carries it in a shared
 * value, and a shared value holding a string costs a serialisation branch on
 * every write. `TARGET_NONE` also means "no drag in flight".
 */
export const TARGET_NONE = 0;
export const TARGET_SEEK = 1;
export const TARGET_MARKER_A = 2;
export const TARGET_MARKER_B = 3;

/** A marker position that is not set. Positions are never negative. */
export const NO_MARKER = -1;

/**
 * The live position of whatever the finger is moving on the waveform.
 *
 * ## Why this is not React state
 *
 * A marker being dragged is a gesture value, not transport state. It used to be
 * written to the audio engine at the drag's throttled cadence, which published a
 * new transport snapshot twenty times a second — so the player screen and every
 * control under it re-rendered for the whole length of the drag. Measured on a
 * 120Hz mid-range Android, that took a marker drag to twenty renders of the
 * entire screen per second, halved the frames the drag drew, and tripled the
 * 90th-percentile frame time against the same surface being seek-dragged.
 *
 * So the engine now hears about a marker twice per gesture — where it was
 * grabbed or dropped, and where it was released — and everything in between is
 * read from here. The overlays that have to follow the finger every frame (the
 * marker line, its flag, the loop wash) read it from the UI thread through
 * animated styles. The two places React still has to draw a *number* from it —
 * the bars' region edges and the A/B tiles' times — project it on the UI thread
 * and cross back only when their own coarse value changes; see
 * {@link useUiDerivedNumber}.
 *
 * ## Who owns it
 *
 * The screen does, because the waveform and the marker tiles are siblings and
 * both draw from it. `useWaveformGesture` writes it; everything else only
 * reads. A component handed no drag makes its own, so it still works standalone
 * — it simply never sees a drag it is not wired to.
 */
export interface MarkerDrag {
  /** Which element is moving, as one of the `TARGET_*` constants. */
  target: SharedValue<number>;
  /** Where that element currently is, in milliseconds. */
  ms: SharedValue<number>;
}

/**
 * Create the shared values a waveform drag is published through.
 *
 * Memoised as one object because consumers put it in worklet dependency arrays,
 * and a fresh object each render would rebuild the gesture — a Pan rebuilt
 * mid-drag drops the drag.
 */
export function useMarkerDrag(): MarkerDrag {
  const target = useSharedValue(TARGET_NONE);
  const ms = useSharedValue(0);
  return useMemo(() => ({ target, ms }), [target, ms]);
}

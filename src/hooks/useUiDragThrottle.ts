import { useCallback, useMemo } from 'react';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

// Throttle native callbacks during a drag to ~20/sec. The native call
// (`setPositionAsync`, a marker write, the preview monitor) is the bottleneck,
// not the drawing, so the surface follows the finger every frame while the
// callback is rate-limited.
const DEFAULT_THROTTLE_MS = 50;

export interface UiDragThrottle {
  /** Drag start: fire immediately, unthrottled. A worklet. */
  begin: (value: number) => void;
  /** Drag move: record the value, fire at most once per window. A worklet. */
  move: (value: number) => void;
  /** Drag end: fire the final value if it has not been fired. A worklet. */
  end: () => void;
}

/**
 * Throttle bookkeeping for a drag, kept **on the UI thread**.
 *
 * The grant fires immediately (instant tap response), moves are rate-limited to
 * one call per `throttleMs`, and `end` fires one final unthrottled call so the
 * committed value is accurate. The redundant final call is skipped when the
 * last value was already fired (a pure tap, or a drag whose final move was not
 * throttled).
 *
 * This is the JavaScript-side throttle the sliders and the waveform used to
 * share, moved across the thread boundary. It has to be here rather than there:
 * the point of the move is that a pointer event no longer reaches JavaScript at
 * all, so a throttle that only decided what to do *after* arriving would have
 * saved nothing. Deciding on the UI thread is what turns sixty to a hundred and
 * twenty events a second into twenty calls.
 *
 * `onFire` is called through `runOnJS`, which preserves the order calls were
 * scheduled in. A caller that schedules its own end-of-gesture work after
 * `end()` can therefore rely on the final value having been delivered first.
 * It must be stable — capture it from a ref, not from props.
 */
export function useUiDragThrottle(
  onFire: (value: number) => void,
  throttleMs: number = DEFAULT_THROTTLE_MS,
): UiDragThrottle {
  const lastFireAt = useSharedValue(0);
  // -1 rather than null: a shared value holding a union costs a serialisation
  // branch on every write, and no caller uses a negative position.
  const lastFired = useSharedValue(-1);
  const pending = useSharedValue(-1);

  const begin = useCallback(
    (value: number) => {
      'worklet';
      pending.value = value;
      lastFireAt.value = Date.now();
      lastFired.value = value;
      runOnJS(onFire)(value);
    },
    [onFire, pending, lastFireAt, lastFired],
  );

  const move = useCallback(
    (value: number) => {
      'worklet';
      pending.value = value;
      const now = Date.now();
      if (now - lastFireAt.value >= throttleMs) {
        lastFireAt.value = now;
        lastFired.value = value;
        runOnJS(onFire)(value);
      }
    },
    [onFire, throttleMs, pending, lastFireAt, lastFired],
  );

  const end = useCallback(() => {
    'worklet';
    if (pending.value >= 0 && pending.value !== lastFired.value) {
      runOnJS(onFire)(pending.value);
    }
    pending.value = -1;
    lastFired.value = -1;
  }, [onFire, pending, lastFired]);

  // Memoised as one object, not three loose callbacks: callers put the throttle
  // itself in the dependency array of the gesture worklets, so a fresh object
  // literal each render would rebuild the Pan on every render — and a Pan
  // rebuilt mid-drag drops the drag.
  return useMemo(() => ({ begin, move, end }), [begin, move, end]);
}

import { useCallback, useRef } from 'react';

// Throttle native callbacks during a drag to ~20/sec. The native bridge
// (e.g. setPositionAsync) is the bottleneck, not React, so callers update
// their visual every frame while the native call is rate-limited.
const DEFAULT_THROTTLE_MS = 50;

/**
 * Throttle bookkeeping for a drag gesture, shared by SeekBar and
 * WaveformView. The grant fires immediately (instant tap response), moves
 * are rate-limited to one call per `throttleMs`, and `end` fires one final
 * unthrottled call so the committed value is accurate. The redundant final
 * call is skipped when the last value was already fired (a pure tap, or a
 * drag whose final move wasn't throttled).
 *
 * Values are positions in milliseconds. Each component keeps its own local
 * drag-visual state — this hook only governs when the native callback runs.
 */
export function useDragThrottle(throttleMs: number = DEFAULT_THROTTLE_MS) {
  const lastFireAt = useRef(0);
  const lastFiredValue = useRef<number | null>(null);
  const pendingValue = useRef<number | null>(null);
  const callbackRef = useRef<((value: number) => void) | null>(null);

  // Drag start: record the active callback for this gesture and fire
  // immediately. No throttling on grant so taps respond instantly.
  const begin = useCallback(
    (value: number, callback: (value: number) => void) => {
      callbackRef.current = callback;
      pendingValue.current = value;
      lastFireAt.current = Date.now();
      lastFiredValue.current = value;
      callback(value);
    },
    [],
  );

  // Drag move: always record the latest value; fire only once per window.
  const move = useCallback(
    (value: number) => {
      pendingValue.current = value;
      const now = Date.now();
      if (now - lastFireAt.current >= throttleMs) {
        lastFireAt.current = now;
        lastFiredValue.current = value;
        callbackRef.current?.(value);
      }
    },
    [throttleMs],
  );

  // Drag end (or interruption): commit the final value if it hasn't been
  // fired yet, then reset for the next gesture.
  const end = useCallback(() => {
    if (
      pendingValue.current !== null &&
      pendingValue.current !== lastFiredValue.current &&
      callbackRef.current
    ) {
      callbackRef.current(pendingValue.current);
    }
    pendingValue.current = null;
    lastFiredValue.current = null;
    callbackRef.current = null;
  }, []);

  return { begin, move, end };
}

import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';

import { useLatestRef } from './useLatestRef';

export interface PanGestureCallbacks {
  /** A finger has landed. Coordinates are relative to the gesture's view. */
  onBegin: (x: number, y: number) => void;
  /** The finger has moved, in the same coordinate space as `onBegin`. */
  onUpdate: (x: number, y: number) => void;
  /** The gesture is over, however it ended. */
  onFinalize: () => void;
}

/**
 * A Pan gesture that claims the touch immediately and calls back on the JS
 * thread, built once and never rebuilt.
 *
 * Shared by the two position-driven surfaces: the seek and volume sliders
 * (`useSliderGesture`) and the waveform (`useWaveformGesture`). Both read a
 * coordinate off the event and turn it into a position, so both need the same
 * three settings, and all three are load-bearing:
 *
 *  - **`minDistance(0)`** makes the gesture claim the touch the instant a
 *    finger lands, so an enclosing `ScrollView` cannot steal a drag. Without
 *    it a drag that starts as a small vertical movement is handed to the
 *    scroller and the marker never moves.
 *  - **`runOnJS(true)`** keeps the callbacks on the JS thread, so they can
 *    touch React state and the drag throttle directly instead of hopping back
 *    from the UI thread.
 *  - **Latest-callback refs** mean the gesture object is built exactly once
 *    (ref identities are stable) while still calling the newest closures. A
 *    gesture rebuilt mid-drag drops the drag.
 *
 * Reading `.current` in the handlers is safe, and is what the three
 * suppressions below say: RNGH invokes them on touch, always after commit,
 * never during render. The lint rule cannot see that the handlers defer
 * execution.
 *
 * The long-press reorder drag in `DraggablePinnedFolderList` is a third Pan
 * gesture and is deliberately not routed through here. It activates
 * differently (`activateAfterLongPress` rather than `minDistance(0)`) and
 * works in translation rather than position, so sharing it would mean
 * parameterising which event field each handler reads. It keeps its own
 * copy, and its own suppressions, which point back at this comment.
 */
export function usePanGesture({
  onBegin,
  onUpdate,
  onFinalize,
}: PanGestureCallbacks) {
  const beginRef = useLatestRef(onBegin);
  const moveRef = useLatestRef(onUpdate);
  const endRef = useLatestRef(onFinalize);

  return useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onBegin((e) => beginRef.current(e.x, e.y))
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onUpdate((e) => moveRef.current(e.x, e.y))
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onFinalize(() => endRef.current()),
    // Ref identities never change, so the Pan is still built exactly once.
    [beginRef, moveRef, endRef],
  );
}

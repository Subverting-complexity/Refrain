import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';

export interface PanGestureCallbacks {
  /**
   * A finger has landed. Coordinates are relative to the gesture's view.
   * A worklet — see the note on the UI thread below.
   */
  onBegin: (x: number, y: number) => void;
  /** The finger has moved, in the same coordinate space as `onBegin`. A worklet. */
  onUpdate: (x: number, y: number) => void;
  /** The gesture is over, however it ended. A worklet. */
  onFinalize: () => void;
}

/**
 * A Pan gesture that claims the touch immediately and handles it **on the UI
 * thread**, built once and never rebuilt.
 *
 * Shared by the two position-driven surfaces: the seek and volume sliders
 * (`useSliderGesture`) and the waveform (`useWaveformGesture`). Both read a
 * coordinate off the event and turn it into a position.
 *
 * ## Why the UI thread
 *
 * This gesture used to carry `.runOnJS(true)`, which sends every pointer event
 * to the JavaScript thread. Each one then set React state, re-rendered the
 * surface and waited for the commit before anything moved, so the picture was
 * always at least a frame behind the finger and the JS thread had to absorb
 * one full render per event.
 *
 * That is affordable on iOS and not on Android, which is why the same code
 * felt fine on one and not the other. Android delivers a move event per display
 * refresh, so a 120Hz panel produces twice the events a 60Hz iPhone does, and
 * it runs them on an engine several times slower. The work per event was
 * already small; there was simply no arithmetic that made 120 renders a second
 * fit, because the problem was never the size of the render — it was that a
 * render stood between the finger and the pixel at all.
 *
 * Handlers now run as worklets on the UI thread. They move the surface by
 * writing shared values that animated styles read directly, so a drag draws
 * without React rendering at all, and they cross to JavaScript only for the
 * throttled audio calls — around twenty a second rather than every event.
 *
 * ## What callers must guarantee
 *
 * The three handlers are captured when the gesture is built, so they must be
 * stable: a gesture rebuilt mid-drag drops the drag. Stability comes from what
 * a handler closes over — shared values (whose identity never changes) and
 * callbacks with no reactive dependencies. Anything that varies belongs in a
 * shared value, not in the closure. Both callers are written that way, and
 * both assert it.
 *
 * `minDistance(0)` makes the gesture claim the touch the instant a finger
 * lands, so an enclosing `ScrollView` cannot steal a drag. Without it a drag
 * that starts as a small vertical movement is handed to the scroller and the
 * marker never moves.
 *
 * The long-press reorder drag in `DraggablePinnedFolderList` is a third Pan
 * gesture and is deliberately not routed through here. It activates
 * differently (`activateAfterLongPress` rather than `minDistance(0)`) and
 * works in translation rather than position, so sharing it would mean
 * parameterising which event field each handler reads. It keeps its own copy,
 * and runs on the UI thread for the same reasons.
 */
export function usePanGesture({
  onBegin,
  onUpdate,
  onFinalize,
}: PanGestureCallbacks) {
  return useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          'worklet';
          onBegin(e.x, e.y);
        })
        .onUpdate((e) => {
          'worklet';
          onUpdate(e.x, e.y);
        })
        .onFinalize(() => {
          'worklet';
          onFinalize();
        }),
    [onBegin, onUpdate, onFinalize],
  );
}

import { useCallback, useRef } from 'react';
import { LayoutChangeEvent } from 'react-native';
import { runOnJS, SharedValue, useSharedValue } from 'react-native-reanimated';

import {
  HORIZONTAL_PADDING,
  MARKER_HIT_ZONE_PX,
  positionFromTouchX,
  trackOffsetPx,
} from '../components/waveformLayout';
import { clampToBounds, markerBounds } from '../utils/markerBounds';
import { useLatestRef } from './useLatestRef';
import {
  MarkerDrag,
  NO_MARKER,
  TARGET_MARKER_A,
  TARGET_MARKER_B,
  TARGET_NONE,
  TARGET_SEEK,
  useMarkerDrag,
} from './useMarkerDrag';
import { usePanGesture } from './usePanGesture';
import { useSharedNumber } from './useSharedNumber';
import { useUiDragThrottle } from './useUiDragThrottle';

/** What an in-flight waveform gesture is moving. */
export type DragTarget = 'markerA' | 'markerB' | 'seek';

// Re-exported so the surface's own vocabulary stays in one import for its
// callers, while the shared values themselves live in a leaf module the marker
// tiles can reach without pulling in the gesture machinery.
export {
  NO_MARKER,
  TARGET_MARKER_A,
  TARGET_MARKER_B,
  TARGET_NONE,
  TARGET_SEEK,
};
export type { MarkerDrag };

/**
 * Which marker a numeric target names, for the callbacks that take a letter.
 *
 * A worklet as well as a plain function, because `clampForTarget` calls it on
 * the UI thread. Without the directive every marker drag threw
 * `Tried to synchronously call a non-worklet function` out of the pan handler
 * on the first pointer event, which is why dragging a handle did nothing but
 * raise an error overlay. The JavaScript-thread callers are unaffected.
 */
function markerLetter(target: number): 'A' | 'B' {
  'worklet';
  return target === TARGET_MARKER_A ? 'A' : 'B';
}

export interface UseWaveformGestureParams {
  durationMs: number;
  /** Height of the touch surface, used to split A (top) from B (bottom). */
  height: number;
  /**
   * Where to publish the in-flight drag. Supply the screen's own
   * {@link MarkerDrag} when something outside the waveform draws from it — the
   * marker tiles do — and omit it for a surface that stands alone.
   */
  drag?: MarkerDrag;
  markerA?: number;
  markerB?: number;
  /**
   * Tap-to-place arm state. `'none'` means a tap only seeks; `'A'`/`'B'` means
   * the next tap drops that marker. Grabbing an existing handle works either
   * way.
   */
  placeMode: 'none' | 'A' | 'B';
  onSeek: (positionMs: number) => void;
  /**
   * Where a marker landed. Called twice per marker gesture — once when the
   * handle is grabbed or the marker dropped, and once with the final position
   * on release — never at the drag's cadence. See {@link MarkerDrag} for why:
   * an engine write is a transport change, and a transport change is a render
   * of the whole screen.
   */
  onMarkerAChange?: (positionMs: number) => void;
  onMarkerBChange?: (positionMs: number) => void;
  onPlaceComplete?: (marker: 'A' | 'B') => void;
  /**
   * Fired once a marker edit is committed — on release of a tap-to-place *or*
   * a fine-tune drag — so the caller can park the playhead at the loop start.
   * Distinct from `onPlaceComplete`, which is placement-only because it drives
   * the arm state; nudging an existing handle must move the playhead without
   * re-arming anything.
   */
  onMarkerCommit?: (marker: 'A' | 'B') => void;
  onPreviewStart?: (centerMs: number) => void;
  onPreviewMove?: (centerMs: number) => void;
  onPreviewEnd?: () => void;
}

export interface UseWaveformGesture {
  /** The Pan gesture to hand to a `GestureDetector`. Built once. */
  gesture: ReturnType<typeof usePanGesture>;
  /** Layout handler for the touch surface; measures the track width. */
  onLayout: (e: LayoutChangeEvent) => void;
  /** Width of the track the bars occupy, in pixels. */
  trackWidth: SharedValue<number>;
  /** The drag being published — the one passed in, or this hook's own. */
  drag: MarkerDrag;
  /** Which element the finger is moving, as one of the `TARGET_*` constants. */
  dragTarget: SharedValue<number>;
  /** Where that element currently is, in milliseconds. */
  dragMs: SharedValue<number>;
  /** A and B as the UI thread sees them, with {@link NO_MARKER} for unset. */
  markerAValue: SharedValue<number>;
  markerBValue: SharedValue<number>;
}

function isMarkerTarget(target: number): boolean {
  'worklet';
  return target === TARGET_MARKER_A || target === TARGET_MARKER_B;
}

/**
 * The waveform's touch behaviour: hit-testing a touch to a marker handle or a
 * seek, mapping x to a position, keeping a dragged marker inside its legal
 * bounds, throttling the native callback, and wiring the snippet preview.
 *
 * ## Where the work happens
 *
 * Everything between the finger and the pixel runs on the UI thread. A pointer
 * event is hit-tested, mapped and clamped in a worklet, and the result written
 * to `dragMs`; the overlays read that through animated styles. React is not
 * involved in a drag at all, which is the point — see `usePanGesture` for why
 * the previous arrangement could not be made fast enough on Android.
 *
 * JavaScript is reached only for what genuinely has to happen there. A seek and
 * the preview monitor need a stream of positions, so they get one at the
 * throttled twenty a second. A marker does not: writing one to the engine
 * republishes the transport, and that is a render of the whole screen, so it
 * happens twice — at the grab and on release — and the shared values carry it
 * in between. Everything crosses through `runOnJS`, which preserves the order
 * calls were scheduled in: the start hook runs before the first value it
 * applies to, and the final preview follow lands before the commit that reads
 * the end state.
 *
 * Every input the worklets need is mirrored into a shared value rather than
 * captured, so the handlers never change identity and the Pan is built exactly
 * once. A gesture rebuilt mid-drag drops the drag.
 */
export function useWaveformGesture({
  durationMs,
  height,
  drag: providedDrag,
  markerA,
  markerB,
  placeMode,
  onSeek,
  onMarkerAChange,
  onMarkerBChange,
  onPlaceComplete,
  onMarkerCommit,
  onPreviewStart,
  onPreviewMove,
  onPreviewEnd,
}: UseWaveformGestureParams): UseWaveformGesture {
  const trackWidth = useSharedValue(0);
  // A surface with nowhere to publish its drag keeps one to itself, so it still
  // moves its own overlays. The hook runs either way — a hook cannot be
  // conditional — and the unused pair costs two shared values.
  const ownDrag = useMarkerDrag();
  const drag = providedDrag ?? ownDrag;
  const dragTarget = drag.target;
  const dragMs = drag.ms;
  // Whether the in-flight gesture is an arm-driven placement (vs. a fine-tune
  // drag of an existing handle, or a plain seek), so the end of the gesture
  // knows to advance the parent's arm state.
  const isPlacement = useSharedValue(false);

  const durationValue = useSharedNumber(durationMs);
  const heightValue = useSharedNumber(height);
  const markerAValue = useSharedNumber(markerA ?? NO_MARKER);
  const markerBValue = useSharedNumber(markerB ?? NO_MARKER);
  // Only markers with a change handler are grabbable, so a read-only waveform
  // never claims a touch for a drag. The arm state is folded in the same way:
  // the UI thread needs it to decide what a tap does.
  const canMoveA = useSharedNumber(onMarkerAChange ? 1 : 0);
  const canMoveB = useSharedNumber(onMarkerBChange ? 1 : 0);
  const armed = useSharedNumber(
    placeMode === 'A'
      ? TARGET_MARKER_A
      : placeMode === 'B'
        ? TARGET_MARKER_B
        : TARGET_NONE,
  );

  // The JavaScript-thread side. Every one of these is stable — it reads the
  // newest props from a ref — so nothing that captures it has to be rebuilt.
  const seekRef = useLatestRef(onSeek);
  const markerARef = useLatestRef(onMarkerAChange);
  const markerBRef = useLatestRef(onMarkerBChange);
  const placeCompleteRef = useLatestRef(onPlaceComplete);
  const markerCommitRef = useLatestRef(onMarkerCommit);
  const previewStartRef = useLatestRef(onPreviewStart);
  const previewMoveRef = useLatestRef(onPreviewMove);
  const previewEndRef = useLatestRef(onPreviewEnd);

  // Which element the throttled callback below is feeding. Set once per
  // gesture, from the UI thread, before any value is delivered.
  const activeTarget = useRef<number>(TARGET_NONE);

  const applyMarker = useCallback(
    (target: number, ms: number) => {
      if (target === TARGET_MARKER_A) markerARef.current?.(ms);
      else if (target === TARGET_MARKER_B) markerBRef.current?.(ms);
    },
    [markerARef, markerBRef],
  );

  /**
   * The throttled per-move callback. A seek goes to the engine here, because a
   * seek *is* the position — there is nowhere else for it to land. A marker
   * does not: the only thing it feeds mid-drag is the audio the preview plays,
   * which is not React's business. Where the marker has got to is read from the
   * shared values instead; see {@link MarkerDrag}.
   */
  const deliver = useCallback(
    (ms: number) => {
      const target = activeTarget.current;
      if (isMarkerTarget(target)) previewMoveRef.current?.(ms);
      else seekRef.current(ms);
    },
    [seekRef, previewMoveRef],
  );
  const throttle = useUiDragThrottle(deliver);

  const beginOnJS = useCallback(
    (target: number, ms: number) => {
      activeTarget.current = target;
      if (isMarkerTarget(target)) {
        // The one mid-gesture write, and it is not an optimisation to remove:
        // a tap-to-place has no marker yet, and the overlay only draws a marker
        // the screen knows about. Grabbing an existing handle re-writes the
        // position it already had, which changes nothing and so renders
        // nothing.
        applyMarker(target, ms);
        previewStartRef.current?.(ms);
      }
    },
    [applyMarker, previewStartRef],
  );

  const endOnJS = useCallback(
    (target: number, placement: boolean, ms: number) => {
      if (isMarkerTarget(target)) {
        // The whole drag arrives here as one write, then the commit. Commit
        // before tearing the preview down: while the monitor is still active
        // the engine redirects its pending restore to the loop start, so the
        // playhead moves exactly once instead of racing the restore's seek.
        applyMarker(target, ms);
        markerCommitRef.current?.(markerLetter(target));
        previewEndRef.current?.();
      }
      if (placement) placeCompleteRef.current?.(markerLetter(target));
      activeTarget.current = TARGET_NONE;
    },
    [applyMarker, markerCommitRef, previewEndRef, placeCompleteRef],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      // The bars are inset by HORIZONTAL_PADDING on each side, so the touchable
      // track spans the measured width less both insets.
      trackWidth.value = Math.max(
        0,
        e.nativeEvent.layout.width - 2 * HORIZONTAL_PADDING,
      );
    },
    [trackWidth],
  );

  /**
   * Which existing marker handle (if any) sits under this touch. When both
   * handles fall within the horizontal hit zone (markers near the same x), the
   * touch's vertical half disambiguates: A lives at the top, B at the bottom,
   * so near-overlapping markers stay individually selectable on a small screen.
   */
  const grabbedHandle = useCallback(
    (x: number, y: number): number => {
      'worklet';
      if (trackWidth.value <= 0 || durationValue.value <= 0) return TARGET_NONE;

      const hits = (ms: number): boolean => {
        'worklet';
        const handleX =
          HORIZONTAL_PADDING +
          trackOffsetPx(ms, durationValue.value, trackWidth.value);
        return Math.abs(x - handleX) <= MARKER_HIT_ZONE_PX;
      };

      const aHit =
        markerAValue.value !== NO_MARKER &&
        canMoveA.value === 1 &&
        hits(markerAValue.value);
      const bHit =
        markerBValue.value !== NO_MARKER &&
        canMoveB.value === 1 &&
        hits(markerBValue.value);

      if (aHit && bHit) {
        return y < heightValue.value / 2 ? TARGET_MARKER_A : TARGET_MARKER_B;
      }
      if (aHit) return TARGET_MARKER_A;
      if (bHit) return TARGET_MARKER_B;
      return TARGET_NONE;
    },
    [
      trackWidth,
      durationValue,
      markerAValue,
      markerBValue,
      canMoveA,
      canMoveB,
      heightValue,
    ],
  );

  /**
   * Decide what a touch does: grab an existing handle (fine-tune), drop an
   * armed marker, or seek. Placement only happens when the parent has armed it
   * — an unarmed tap on the wave always just seeks. Grabbing an existing handle
   * takes priority so a placed marker stays adjustable.
   */
  const detectTarget = useCallback(
    (x: number, y: number): number => {
      'worklet';
      const grabbed = grabbedHandle(x, y);
      if (grabbed !== TARGET_NONE) {
        isPlacement.value = false;
        return grabbed;
      }
      const arm = armed.value;
      if (arm === TARGET_MARKER_A && canMoveA.value === 1) {
        isPlacement.value = true;
        return TARGET_MARKER_A;
      }
      if (arm === TARGET_MARKER_B && canMoveB.value === 1) {
        isPlacement.value = true;
        return TARGET_MARKER_B;
      }
      isPlacement.value = false;
      return TARGET_SEEK;
    },
    [grabbedHandle, armed, canMoveA, canMoveB, isPlacement],
  );

  /**
   * Keep a dragged or placed marker valid relative to its sibling. B can never
   * be placed at or before A (the A < B invariant the engine enforces), so it
   * is clamped to just past A — the handle visibly stops at the boundary
   * instead of snapping back silently when dropped before A. Shared with the
   * marker time editor via `markerBounds` so both stop identically.
   */
  const clampForTarget = useCallback(
    (target: number, ms: number): number => {
      'worklet';
      if (!isMarkerTarget(target)) return ms;
      const a = markerAValue.value === NO_MARKER ? null : markerAValue.value;
      const b = markerBValue.value === NO_MARKER ? null : markerBValue.value;
      return clampToBounds(
        ms,
        markerBounds(markerLetter(target), a, b, durationValue.value),
      );
    },
    [markerAValue, markerBValue, durationValue],
  );

  const onBegin = useCallback(
    (x: number, y: number) => {
      'worklet';
      const raw = positionFromTouchX(x, trackWidth.value, durationValue.value);
      if (raw === null) {
        isPlacement.value = false;
        return;
      }
      const target = detectTarget(x, y);
      const ms = clampForTarget(target, raw);
      dragTarget.value = target;
      dragMs.value = ms;
      // Scheduled before the throttle's first delivery, so the JavaScript side
      // knows where to route it and the preview is running when it lands.
      runOnJS(beginOnJS)(target, ms);
      throttle.begin(ms);
    },
    [
      trackWidth,
      durationValue,
      detectTarget,
      clampForTarget,
      dragTarget,
      dragMs,
      isPlacement,
      beginOnJS,
      throttle,
    ],
  );

  const onUpdate = useCallback(
    (x: number) => {
      'worklet';
      if (dragTarget.value === TARGET_NONE) return;
      const raw = positionFromTouchX(x, trackWidth.value, durationValue.value);
      if (raw === null) return;
      dragMs.value = clampForTarget(dragTarget.value, raw);
      throttle.move(dragMs.value);
    },
    [dragTarget, trackWidth, durationValue, clampForTarget, dragMs, throttle],
  );

  const onFinalize = useCallback(() => {
    'worklet';
    const target = dragTarget.value;
    if (target === TARGET_NONE) return;
    const placement = isPlacement.value;
    // Flush the final throttled value — the last preview follow, or the last
    // seek — before the end hook, so the monitor restores from the correct end
    // state. `runOnJS` keeps the two in that order.
    throttle.end();
    runOnJS(endOnJS)(target, placement, dragMs.value);
    isPlacement.value = false;
    dragTarget.value = TARGET_NONE;
  }, [dragTarget, dragMs, isPlacement, throttle, endOnJS]);

  const gesture = usePanGesture({ onBegin, onUpdate, onFinalize });

  return {
    gesture,
    onLayout,
    trackWidth,
    drag,
    dragTarget,
    dragMs,
    markerAValue,
    markerBValue,
  };
}

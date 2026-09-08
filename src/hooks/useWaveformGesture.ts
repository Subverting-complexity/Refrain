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
import { usePanGesture } from './usePanGesture';
import { useSharedNumber } from './useSharedNumber';
import { useUiDragThrottle } from './useUiDragThrottle';

/** What an in-flight waveform gesture is moving. */
export type DragTarget = 'markerA' | 'markerB' | 'seek';

/**
 * The drag target as a number, because the UI thread carries it in a shared
 * value and a shared value holding a string costs a serialisation branch on
 * every write. `TARGET_NONE` also means "no drag in flight".
 */
export const TARGET_NONE = 0;
export const TARGET_SEEK = 1;
export const TARGET_MARKER_A = 2;
export const TARGET_MARKER_B = 3;

/** A marker position that is not set. Positions are never negative. */
export const NO_MARKER = -1;

/** Which marker a numeric target names, for the callbacks that take a letter. */
function markerLetter(target: number): 'A' | 'B' {
  return target === TARGET_MARKER_A ? 'A' : 'B';
}

export interface UseWaveformGestureParams {
  durationMs: number;
  /** Height of the touch surface, used to split A (top) from B (bottom). */
  height: number;
  markerA?: number;
  markerB?: number;
  /**
   * Tap-to-place arm state. `'none'` means a tap only seeks; `'A'`/`'B'` means
   * the next tap drops that marker. Grabbing an existing handle works either
   * way.
   */
  placeMode: 'none' | 'A' | 'B';
  onSeek: (positionMs: number) => void;
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
 * JavaScript is reached only for what genuinely has to happen there: the audio
 * engine calls, at the throttled twenty a second, and the once-per-gesture
 * bookkeeping at either end. Those cross through `runOnJS`, which preserves the
 * order calls were scheduled in — which is what lets the start hook run before
 * the first value it applies to, and the final value be delivered before the
 * commit that reads it.
 *
 * Every input the worklets need is mirrored into a shared value rather than
 * captured, so the handlers never change identity and the Pan is built exactly
 * once. A gesture rebuilt mid-drag drops the drag.
 */
export function useWaveformGesture({
  durationMs,
  height,
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
  const dragTarget = useSharedValue(TARGET_NONE);
  const dragMs = useSharedValue(0);
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

  const deliver = useCallback(
    (ms: number) => {
      const target = activeTarget.current;
      if (target === TARGET_MARKER_A) markerARef.current?.(ms);
      else if (target === TARGET_MARKER_B) markerBRef.current?.(ms);
      else seekRef.current(ms);
      // The preview follows the marker at the same throttled cadence as the
      // marker itself, and never follows a plain seek.
      if (isMarkerTarget(target)) previewMoveRef.current?.(ms);
    },
    [seekRef, markerARef, markerBRef, previewMoveRef],
  );
  const throttle = useUiDragThrottle(deliver);

  const beginOnJS = useCallback(
    (target: number, ms: number) => {
      activeTarget.current = target;
      if (isMarkerTarget(target)) previewStartRef.current?.(ms);
    },
    [previewStartRef],
  );

  const endOnJS = useCallback(
    (target: number, placement: boolean) => {
      if (isMarkerTarget(target)) {
        // Commit before tearing the preview down. While the monitor is still
        // active the engine redirects its pending restore to the loop start, so
        // the playhead moves exactly once instead of racing the restore's seek.
        markerCommitRef.current?.(markerLetter(target));
        previewEndRef.current?.();
      }
      if (placement) placeCompleteRef.current?.(markerLetter(target));
      activeTarget.current = TARGET_NONE;
    },
    [markerCommitRef, previewEndRef, placeCompleteRef],
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
    // Commit the final throttled value — which also delivers the final preview
    // follow — before the end hook, so the monitor restores from the correct
    // end state. `runOnJS` keeps the two in that order.
    throttle.end();
    runOnJS(endOnJS)(target, placement);
    isPlacement.value = false;
    dragTarget.value = TARGET_NONE;
  }, [dragTarget, isPlacement, throttle, endOnJS]);

  const gesture = usePanGesture({ onBegin, onUpdate, onFinalize });

  return {
    gesture,
    onLayout,
    trackWidth,
    dragTarget,
    dragMs,
    markerAValue,
    markerBValue,
  };
}

import { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import {
  HORIZONTAL_PADDING,
  MARKER_HIT_ZONE_PX,
} from '../components/waveformLayout';
import { clampToBounds, markerBounds } from '../utils/markerBounds';
import { useDragThrottle } from './useDragThrottle';
import { usePanGesture } from './usePanGesture';

/** What an in-flight waveform gesture is moving. */
export type DragTarget = 'markerA' | 'markerB' | 'seek';

/** The live value of the element under the finger during a drag. */
export interface WaveformDrag {
  ms: number;
  target: DragTarget;
}

export interface UseWaveformGestureParams {
  durationMs: number;
  /** Height of the touch surface, used to split A (top) from B (bottom). */
  height: number;
  markerA?: number;
  markerB?: number;
  /**
   * Tap-to-place arm state. `'none'` means a tap only seeks; `'A'`/`'B'` means
   * the next tap drops that marker. Grabbing an existing handle works either way.
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
  gesture: ReturnType<typeof Gesture.Pan>;
  /**
   * The element being dragged and its live position, or `null` when no drag is
   * in flight. Drives the visual every frame while native calls stay throttled.
   */
  drag: WaveformDrag | null;
  /** Layout handler for the touch surface; measures the track width. */
  onLayout: (e: LayoutChangeEvent) => void;
}

const isMarkerTarget = (target: DragTarget): boolean =>
  target === 'markerA' || target === 'markerB';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * The waveform's touch behaviour: hit-testing a touch to a marker handle or a
 * seek, mapping x to a position, keeping a dragged marker inside its legal
 * bounds, throttling the native callback, and wiring the snippet preview.
 *
 * It owns the drag's transient state and hands back a Pan gesture built once —
 * a marker drag updates markerA/markerB ~20x/sec mid-gesture, and rebuilding
 * the gesture that often risks RNGH dropping the active drag.
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
  const containerWidth = useRef(0);
  const dragTarget = useRef<DragTarget>('seek');
  // Whether the in-flight gesture is an arm-driven placement (vs. a fine-tune
  // drag of an existing handle or a plain seek), so endDrag knows to advance
  // the parent's arm state on completion.
  const isPlacement = useRef(false);
  const dragThrottle = useDragThrottle();

  // The target is carried in state (snapshotted from the ref when the drag
  // starts) so render can pick the live element without reading the ref during
  // render. null = not dragging.
  const [drag, setDrag] = useState<WaveformDrag | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    containerWidth.current = e.nativeEvent.layout.width;
  }, []);

  // The bars are inset by HORIZONTAL_PADDING on each side, so the
  // touchable track spans containerWidth - 2 * HORIZONTAL_PADDING.
  const trackWidth = () => containerWidth.current - 2 * HORIZONTAL_PADDING;

  // Map a touch x (relative to the touch area) to a position in ms, clamped
  // to the track. Returns null before layout or for a zero-length track.
  const positionFromX = useCallback(
    (x: number): number | null => {
      if (durationMs <= 0 || trackWidth() <= 0) return null;
      const ratio = clamp01((x - HORIZONTAL_PADDING) / trackWidth());
      return Math.round(ratio * durationMs);
    },
    [durationMs],
  );

  // Which existing marker handle (if any) sits under this touch. Only markers
  // with a change handler are grabbable, so a read-only waveform never claims
  // the touch for a drag. When both handles fall within the horizontal hit
  // zone (markers near the same x), the touch's vertical half disambiguates:
  // A lives at the top, B at the bottom, so near-overlapping markers stay
  // individually selectable on a small screen.
  const detectGrabbedHandle = useCallback(
    (x: number, y: number): DragTarget => {
      if (trackWidth() <= 0 || durationMs <= 0) return 'seek';

      const aHit =
        markerA != null &&
        onMarkerAChange != null &&
        Math.abs(
          x - (HORIZONTAL_PADDING + (markerA / durationMs) * trackWidth()),
        ) <= MARKER_HIT_ZONE_PX;
      const bHit =
        markerB != null &&
        onMarkerBChange != null &&
        Math.abs(
          x - (HORIZONTAL_PADDING + (markerB / durationMs) * trackWidth()),
        ) <= MARKER_HIT_ZONE_PX;

      if (aHit && bHit) {
        return y < height / 2 ? 'markerA' : 'markerB';
      }
      if (aHit) return 'markerA';
      if (bHit) return 'markerB';
      return 'seek';
    },
    [durationMs, markerA, markerB, onMarkerAChange, onMarkerBChange, height],
  );

  // Decide what a touch does: grab an existing handle (fine-tune), drop an
  // armed marker, or seek. Placement only happens when the parent has armed
  // it (placeMode) — an unarmed tap on the wave always just seeks. Grabbing an
  // existing handle takes priority so a placed marker stays adjustable.
  const detectDragTarget = useCallback(
    (x: number, y: number): DragTarget => {
      const grabbed = detectGrabbedHandle(x, y);
      if (grabbed !== 'seek') {
        isPlacement.current = false;
        return grabbed;
      }
      if (placeMode === 'A' && onMarkerAChange) {
        isPlacement.current = true;
        return 'markerA';
      }
      if (placeMode === 'B' && onMarkerBChange) {
        isPlacement.current = true;
        return 'markerB';
      }
      isPlacement.current = false;
      return 'seek';
    },
    [detectGrabbedHandle, placeMode, onMarkerAChange, onMarkerBChange],
  );

  // Keep a dragged/placed marker valid relative to its sibling. The B handle
  // can never be placed at or before A (the A < B invariant the engine
  // enforces), so clamp it to just past A — the handle visibly stops at the
  // boundary instead of snapping back silently when dropped before A. Shared
  // with the marker time editor via `markerBounds` so both stop identically.
  const clampForTarget = useCallback(
    (target: DragTarget, ms: number): number => {
      if (!isMarkerTarget(target)) return ms;
      return clampToBounds(
        ms,
        markerBounds(
          target === 'markerA' ? 'A' : 'B',
          markerA ?? null,
          markerB ?? null,
          durationMs,
        ),
      );
    },
    [markerA, markerB, durationMs],
  );

  // The callback for the active drag target. markerA/markerB targets are
  // only chosen by detectDragTarget when their handler exists, so seek (with
  // its always-present onSeek) is the safe fallback.
  const callbackForTarget = useCallback(
    (target: DragTarget): ((ms: number) => void) => {
      if (target === 'markerA' && onMarkerAChange) return onMarkerAChange;
      if (target === 'markerB' && onMarkerBChange) return onMarkerBChange;
      return onSeek;
    },
    [onSeek, onMarkerAChange, onMarkerBChange],
  );

  // Drag start: pick the target, update the visual, and fire immediately
  // (instant tap response — no throttling on grant).
  const beginDrag = useCallback(
    (x: number, y: number) => {
      dragTarget.current = detectDragTarget(x, y);
      const raw = positionFromX(x);
      if (raw == null) {
        isPlacement.current = false;
        return;
      }
      const target = dragTarget.current;
      const ms = clampForTarget(target, raw);
      setDrag({ ms, target });

      // Wire the rolling-monitor preview to marker gestures only (never plain
      // seeks). Start it once here, and compose its follow into the throttled
      // marker callback so it tracks the marker at the same ~20/sec cadence.
      let throttledCallback = callbackForTarget(target);
      if (isMarkerTarget(target) && (onPreviewStart || onPreviewMove)) {
        onPreviewStart?.(ms);
        if (onPreviewMove) {
          const base = throttledCallback;
          throttledCallback = (value: number) => {
            base(value);
            onPreviewMove(value);
          };
        }
      }
      dragThrottle.begin(ms, throttledCallback);
    },
    [
      detectDragTarget,
      positionFromX,
      clampForTarget,
      callbackForTarget,
      dragThrottle,
      onPreviewStart,
      onPreviewMove,
    ],
  );

  // Drag move: update the visual every frame, but throttle native calls.
  const moveDrag = useCallback(
    (x: number) => {
      const raw = positionFromX(x);
      if (raw == null) return;
      const ms = clampForTarget(dragTarget.current, raw);
      setDrag({ ms, target: dragTarget.current });
      dragThrottle.move(ms);
    },
    [positionFromX, clampForTarget, dragThrottle],
  );

  // Drag end (or interruption): commit the final value, advance the arm state
  // if this was an arm-driven placement, then drop back to the prop-driven
  // visual.
  const endDrag = useCallback(() => {
    // Commit the final throttled value (which also delivers the final preview
    // follow) before tearing the preview down, so the monitor restores from the
    // correct end state.
    dragThrottle.end();
    if (isMarkerTarget(dragTarget.current)) {
      // Commit before tearing the preview down. While the monitor is still
      // active the engine redirects its pending restore to the loop start, so
      // the playhead moves exactly once instead of racing the restore's seek.
      onMarkerCommit?.(dragTarget.current === 'markerA' ? 'A' : 'B');
      onPreviewEnd?.();
    }
    if (isPlacement.current) {
      isPlacement.current = false;
      onPlaceComplete?.(dragTarget.current === 'markerA' ? 'A' : 'B');
    }
    setDrag(null);
  }, [dragThrottle, onPlaceComplete, onMarkerCommit, onPreviewEnd]);

  const gesture = usePanGesture({
    onBegin: beginDrag,
    onUpdate: moveDrag,
    onFinalize: endDrag,
  });

  return { gesture, drag, onLayout };
}

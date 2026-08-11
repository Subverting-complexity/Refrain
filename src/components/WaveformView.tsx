import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityInfo,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useDragThrottle } from '../hooks/useDragThrottle';
import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { WaveformPeaks } from '../types';
import { formatDuration } from '../utils/formatTime';
import { clampToBounds, markerBounds } from '../utils/markerBounds';

interface WaveformViewProps {
  peaks: WaveformPeaks;
  positionMs: number;
  durationMs: number;
  onSeek: (positionMs: number) => void;
  markerA?: number;
  markerB?: number;
  /**
   * Whether the A/B loop is armed. When both markers are set and this is
   * true, the fill is scoped to the loop: the region before A is never
   * coloured in (playback is locked between A and B), so the "played"
   * highlight only grows from A up to the playhead.
   */
  loopEnabled?: boolean;
  /**
   * The arm state for tap-to-place. When `'none'` (default), a tap on the wave
   * only seeks. When `'A'` or `'B'`, the next tap drops that marker where you
   * touch. Existing handles stay draggable regardless of this. The arming flow
   * is driven from the A/B buttons in MarkerControls.
   */
  placeMode?: 'none' | 'A' | 'B';
  /**
   * Fired once a tap-to-place placement completes, with which marker was
   * placed, so the parent can advance the arm state (A → B, then B → none).
   * Not called for fine-tune drags of an already-placed handle.
   */
  onPlaceComplete?: (marker: 'A' | 'B') => void;
  onMarkerAChange?: (positionMs: number) => void;
  onMarkerBChange?: (positionMs: number) => void;
  /**
   * Snippet-preview hooks for the engine's rolling monitor. Fired only for
   * marker gestures (dragging an existing A/B handle, or a tap-to-place), never
   * for plain seeks. `onPreviewStart` runs once when the gesture grabs/places a
   * marker; `onPreviewMove` follows the marker at the same throttled cadence as
   * the marker callback; `onPreviewEnd` runs on release. Omit them (the player
   * passes nothing when the preference is off) to disable the preview — dragging
   * then behaves exactly as before.
   */
  onPreviewStart?: (centerMs: number) => void;
  onPreviewMove?: (centerMs: number) => void;
  onPreviewEnd?: () => void;
  /**
   * Overall height of the waveform surface. Lets the player scale it to the
   * screen so it fills the available space instead of sitting small and
   * boxed-in. Defaults to {@link DEFAULT_WAVEFORM_HEIGHT}.
   */
  height?: number;
  style?: ViewStyle;
}

const isMarkerTarget = (target: DragTarget): boolean =>
  target === 'markerA' || target === 'markerB';

const DEFAULT_WAVEFORM_HEIGHT = 180;
// The grab zone around a marker. Generous so a fingertip can land the thin
// line, and matched to the visible handle width so the handle reads as the
// thing you grab.
const MARKER_HIT_ZONE_PX = 24;
const HANDLE_WIDTH = 24;
const HANDLE_HEIGHT = 20;
// Vertical band reserved at the top (for A's flag) and bottom (for B's flag),
// keeping the bars/cursor between them.
const HANDLE_ZONE = HANDLE_HEIGHT + 6;
const SEEK_STEP_MS = 5000;
const HORIZONTAL_PADDING = spacing.md;

// Opacity tiers for the three states a bar can be in. Played bars are bright
// (and graded by amplitude on top of this base); bars inside the A/B region
// that haven't played yet sit at a clearly visible mid tone; everything else
// is dull. Kept as discrete tiers so the loop window reads at a glance.
const PLAYED_BASE_ALPHA = 0.5;
const PLAYED_AMPLITUDE_ALPHA = 0.5;
const LOOP_UNPLAYED_ALPHA = 0.3;
const DULL_ALPHA = 0.12;

type DragTarget = 'markerA' | 'markerB' | 'seek';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

// Append an alpha channel to a #rrggbb hex so a single accent colour can drive
// every tonal tier without extra theme tokens.
function withAlpha(hex: string, alpha: number): string {
  const v = Math.round(clamp(alpha, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${v}`;
}

export function WaveformView({
  peaks,
  positionMs,
  durationMs,
  onSeek,
  markerA,
  markerB,
  loopEnabled = true,
  placeMode = 'none',
  onPlaceComplete,
  onMarkerAChange,
  onMarkerBChange,
  onPreviewStart,
  onPreviewMove,
  onPreviewEnd,
  height = DEFAULT_WAVEFORM_HEIGHT,
  style,
}: WaveformViewProps) {
  const { theme } = useTheme();
  const containerWidth = useRef(0);
  const dragTarget = useRef<DragTarget>('seek');
  // Whether the in-flight gesture is an arm-driven placement (vs. a fine-tune
  // drag of an existing handle or a plain seek), so endDrag knows to advance
  // the parent's arm state on completion.
  const isPlacement = useRef(false);
  const dragThrottle = useDragThrottle();

  // While dragging, this local value drives the visual of whichever element
  // (cursor or marker) is being moved, so it follows the finger every frame
  // even though native calls are throttled. null = not dragging. The target is
  // carried in state (snapshotted from the ref when the drag starts) so render
  // can pick the live element without reading the ref during render.
  const [drag, setDrag] = useState<{ ms: number; target: DragTarget } | null>(
    null,
  );

  const displayPositionMs = drag?.target === 'seek' ? drag.ms : positionMs;
  const displayMarkerA = drag?.target === 'markerA' ? drag.ms : markerA;
  const displayMarkerB = drag?.target === 'markerB' ? drag.ms : markerB;
  const progress = durationMs > 0 ? displayPositionMs / durationMs : 0;

  // The loop is "active" (and the fill scoped to A..B) only when both markers
  // exist, A precedes B, and looping is armed.
  const hasRegion =
    displayMarkerA != null &&
    displayMarkerB != null &&
    displayMarkerA < displayMarkerB &&
    durationMs > 0;
  const aFrac = hasRegion ? (displayMarkerA as number) / durationMs : 0;
  const bFrac = hasRegion ? (displayMarkerB as number) / durationMs : 0;
  const loopActive = hasRegion && loopEnabled;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
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
      const ratio = clamp((x - HORIZONTAL_PADDING) / trackWidth(), 0, 1);
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
      onPreviewEnd?.();
    }
    if (isPlacement.current) {
      isPlacement.current = false;
      onPlaceComplete?.(dragTarget.current === 'markerA' ? 'A' : 'B');
    }
    setDrag(null);
  }, [dragThrottle, onPlaceComplete, onPreviewEnd]);

  // Route the gesture through refs to the latest callbacks so the Pan object
  // itself is created once. A marker drag updates markerA/markerB mid-gesture
  // (throttled), which would otherwise rebuild the gesture ~20x/sec and risk
  // RNGH dropping the active drag.
  const beginRef = useRef(beginDrag);
  const moveRef = useRef(moveDrag);
  const endRef = useRef(endDrag);
  useEffect(() => {
    beginRef.current = beginDrag;
    moveRef.current = moveDrag;
    endRef.current = endDrag;
  });

  // A single Pan drives taps and drags. `minDistance(0)` makes it claim the
  // touch the instant a finger lands on the waveform, so the surrounding
  // ScrollView can't steal a drag (the bug where markers wouldn't move).
  // `runOnJS` keeps the callbacks on the JS thread so they can touch React
  // state and the throttle directly. RNGH invokes these callbacks on touch
  // (after render), never during render, so reading the latest-callback refs
  // here is safe — the rule can't see that the handlers defer execution.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onBegin((e) => beginRef.current(e.x, e.y))
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onUpdate((e) => moveRef.current(e.x))
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onFinalize(() => endRef.current()),
    [],
  );

  const bars = useMemo(() => {
    if (peaks.length === 0) return null;
    const accent = theme.colors.accent;
    const denom = peaks.length;

    return peaks.map((peak, index) => {
      // A bar's centre fraction, in the SAME 0..1 space as `progress` and the
      // cursor, so the fill edge lands exactly under the playhead.
      const center = (index + 0.5) / denom;
      const inRegion = hasRegion && center >= aFrac && center <= bFrac;
      const played = loopActive
        ? inRegion && center <= progress
        : center <= progress;

      let backgroundColor: string;
      if (played) {
        backgroundColor = withAlpha(
          accent,
          PLAYED_BASE_ALPHA + PLAYED_AMPLITUDE_ALPHA * peak,
        );
      } else if (inRegion) {
        backgroundColor = withAlpha(accent, LOOP_UNPLAYED_ALPHA);
      } else {
        backgroundColor = withAlpha(accent, DULL_ALPHA);
      }

      return (
        <View
          key={index}
          style={[
            styles.bar,
            { height: `${Math.max(4, peak * 100)}%`, backgroundColor },
          ]}
        />
      );
    });
  }, [
    peaks,
    progress,
    hasRegion,
    aFrac,
    bFrac,
    loopActive,
    theme.colors.accent,
  ]);

  const markerElements = useMemo(() => {
    if (durationMs <= 0) return null;
    const elements: React.ReactNode[] = [];

    if (hasRegion) {
      // Derive percentages from ms directly (not from aFrac/bFrac) so the
      // width is exact — subtracting the fractions drifts by a float ULP.
      const leftPct = ((displayMarkerA as number) / durationMs) * 100;
      const widthPct =
        (((displayMarkerB as number) - (displayMarkerA as number)) /
          durationMs) *
        100;
      elements.push(
        <View
          key="ab-region"
          pointerEvents="none"
          style={[
            styles.markerRegion,
            {
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              backgroundColor: withAlpha(theme.colors.markerA, 0.05),
            },
          ]}
        />,
      );
    }

    const pushMarker = (
      key: string,
      label: 'start' | 'end',
      ms: number,
      color: string,
      textColor: string,
    ) => {
      const leftPct = (ms / durationMs) * 100;
      const isStart = label === 'start';
      elements.push(
        <View
          key={`${key}-line`}
          pointerEvents="none"
          style={[
            isStart ? styles.markerLineStart : styles.markerLineEnd,
            { left: `${leftPct}%`, backgroundColor: color },
          ]}
          accessibilityLabel={`Loop ${label} marker at ${formatDuration(ms)}`}
        />,
      );
      // A dot where the line meets the bars, plus a labelled flag. A's flag
      // sits at the top and B's at the bottom, so the two grab targets never
      // stack on top of each other even when the markers are close together.
      elements.push(
        <View
          key={`${key}-dot`}
          pointerEvents="none"
          style={[
            isStart ? styles.markerDotStart : styles.markerDotEnd,
            { left: `${leftPct}%`, backgroundColor: color },
          ]}
        />,
      );
      elements.push(
        <View
          key={`${key}-handle`}
          pointerEvents="none"
          style={[
            styles.markerHandle,
            isStart ? styles.markerHandleStart : styles.markerHandleEnd,
            { left: `${leftPct}%`, backgroundColor: color },
          ]}
        >
          <Text style={[styles.markerHandleText, { color: textColor }]}>
            {isStart ? 'A' : 'B'}
          </Text>
        </View>,
      );
    };

    if (displayMarkerA != null) {
      pushMarker(
        'marker-a',
        'start',
        displayMarkerA,
        theme.colors.markerA,
        theme.colors.markerAText,
      );
    }
    if (displayMarkerB != null) {
      pushMarker(
        'marker-b',
        'end',
        displayMarkerB,
        theme.colors.markerB,
        theme.colors.markerBText,
      );
    }

    return elements;
  }, [
    displayMarkerA,
    displayMarkerB,
    durationMs,
    hasRegion,
    theme.colors.markerA,
    theme.colors.markerAText,
    theme.colors.markerB,
    theme.colors.markerBText,
  ]);

  const handleAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (durationMs <= 0) return;
      const { actionName } = e.nativeEvent;
      if (actionName === 'increment') {
        onSeek(Math.min(durationMs, positionMs + SEEK_STEP_MS));
      } else if (actionName === 'decrement') {
        onSeek(Math.max(0, positionMs - SEEK_STEP_MS));
      } else if (actionName === 'placeA' && onMarkerAChange) {
        onMarkerAChange(positionMs);
        AccessibilityInfo.announceForAccessibility(
          `A marker placed at ${formatDuration(positionMs)}`,
        );
      } else if (actionName === 'placeB' && onMarkerBChange) {
        onMarkerBChange(positionMs);
        AccessibilityInfo.announceForAccessibility(
          `B marker placed at ${formatDuration(positionMs)}`,
        );
      }
    },
    [durationMs, positionMs, onSeek, onMarkerAChange, onMarkerBChange],
  );

  const a11yLabel = useMemo(() => {
    let label = `Waveform. Playback position: ${formatDuration(positionMs)} of ${formatDuration(durationMs)}`;
    if (markerA != null && markerB != null) {
      label += `. Loop from ${formatDuration(markerA)} to ${formatDuration(markerB)}`;
    }
    return label;
  }, [positionMs, durationMs, markerA, markerB]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface },
        style,
      ]}
      accessibilityRole="adjustable"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Swipe up or down to seek. Activate for more options including placing loop markers."
      accessibilityActions={[
        { name: 'increment' },
        { name: 'decrement' },
        ...(onMarkerAChange
          ? [{ name: 'placeA', label: 'Place A marker at current position' }]
          : []),
        ...(onMarkerBChange
          ? [{ name: 'placeB', label: 'Place B marker at current position' }]
          : []),
      ]}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <GestureDetector gesture={pan}>
        <View style={[styles.touchArea, { height }]} onLayout={handleLayout}>
          <View style={styles.track}>
            <View style={styles.barsContainer}>{bars}</View>

            {markerElements}

            <View
              pointerEvents="none"
              style={[
                styles.cursor,
                {
                  left: `${progress * 100}%`,
                  backgroundColor: theme.colors.textPrimary,
                },
              ]}
            />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  touchArea: {
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  track: {
    flex: 1,
    marginHorizontal: HORIZONTAL_PADDING,
    position: 'relative',
  },
  // The bars are inset top and bottom by HANDLE_ZONE so the A flag (top) and
  // B flag (bottom) each have their own band clear of the waveform.
  barsContainer: {
    position: 'absolute',
    top: HANDLE_ZONE,
    bottom: HANDLE_ZONE,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bar: {
    flex: 1,
    marginHorizontal: 0.5,
    borderRadius: 2,
    minHeight: 2,
  },
  cursor: {
    position: 'absolute',
    top: HANDLE_ZONE,
    bottom: HANDLE_ZONE,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  // A's line runs from just under its top flag down through the bars; B's runs
  // from the bars down to just above its bottom flag.
  markerLineStart: {
    position: 'absolute',
    top: HANDLE_HEIGHT,
    bottom: HANDLE_ZONE,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  markerLineEnd: {
    position: 'absolute',
    top: HANDLE_ZONE,
    bottom: HANDLE_HEIGHT,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  markerDotStart: {
    position: 'absolute',
    top: HANDLE_HEIGHT,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
  },
  markerDotEnd: {
    position: 'absolute',
    bottom: HANDLE_HEIGHT,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
  },
  markerHandle: {
    position: 'absolute',
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    marginLeft: -HANDLE_WIDTH / 2,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerHandleStart: {
    top: 0,
  },
  markerHandleEnd: {
    bottom: 0,
  },
  markerHandleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  markerRegion: {
    position: 'absolute',
    top: HANDLE_ZONE,
    bottom: HANDLE_ZONE,
  },
});

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useDragThrottle } from '../hooks/useDragThrottle';
import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { WaveformPeaks } from '../types';
import { formatDuration } from '../utils/formatTime';

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
  onMarkerAChange?: (positionMs: number) => void;
  onMarkerBChange?: (positionMs: number) => void;
  style?: ViewStyle;
}

const WAVEFORM_HEIGHT = 132;
// The grab zone around a marker. Generous so a fingertip can land the thin
// line, and matched to the visible handle width so the handle reads as the
// thing you grab.
const MARKER_HIT_ZONE_PX = 24;
const HANDLE_WIDTH = 24;
const HANDLE_HEIGHT = 20;
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
  onMarkerAChange,
  onMarkerBChange,
  style,
}: WaveformViewProps) {
  const { theme } = useTheme();
  const containerWidth = useRef(0);
  const dragTarget = useRef<DragTarget>('seek');
  const dragThrottle = useDragThrottle();

  // While dragging, this local value drives the visual of whichever element
  // (cursor or marker) is being moved, so it follows the finger every frame
  // even though native calls are throttled. null = not dragging.
  const [dragMs, setDragMs] = useState<number | null>(null);

  const isDragging = dragMs !== null;
  const displayPositionMs =
    isDragging && dragTarget.current === 'seek' ? dragMs : positionMs;
  const displayMarkerA =
    isDragging && dragTarget.current === 'markerA' ? dragMs : markerA;
  const displayMarkerB =
    isDragging && dragTarget.current === 'markerB' ? dragMs : markerB;
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
  // the touch for a drag.
  const detectGrabbedHandle = useCallback(
    (x: number): DragTarget => {
      if (trackWidth() <= 0 || durationMs <= 0) return 'seek';

      let closestTarget: DragTarget = 'seek';
      let closestDist = MARKER_HIT_ZONE_PX + 1;

      if (markerA != null && onMarkerAChange) {
        const markerAX =
          HORIZONTAL_PADDING + (markerA / durationMs) * trackWidth();
        const distA = Math.abs(x - markerAX);
        if (distA <= MARKER_HIT_ZONE_PX && distA < closestDist) {
          closestTarget = 'markerA';
          closestDist = distA;
        }
      }
      if (markerB != null && onMarkerBChange) {
        const markerBX =
          HORIZONTAL_PADDING + (markerB / durationMs) * trackWidth();
        const distB = Math.abs(x - markerBX);
        if (distB <= MARKER_HIT_ZONE_PX && distB < closestDist) {
          closestTarget = 'markerB';
          closestDist = distB;
        }
      }
      return closestTarget;
    },
    [durationMs, markerA, markerB, onMarkerAChange, onMarkerBChange],
  );

  // Decide what a touch does: grab an existing handle, place the next missing
  // marker (A first, then B), or seek. This is the tap-to-place flow — the
  // first tap drops A where you touch, the next drops B, and afterwards taps
  // seek while handles stay draggable.
  const detectDragTarget = useCallback(
    (x: number): DragTarget => {
      const grabbed = detectGrabbedHandle(x);
      if (grabbed !== 'seek') return grabbed;
      if (markerA == null && onMarkerAChange) return 'markerA';
      if (markerA != null && markerB == null && onMarkerBChange) {
        return 'markerB';
      }
      return 'seek';
    },
    [detectGrabbedHandle, markerA, markerB, onMarkerAChange, onMarkerBChange],
  );

  // Keep a dragged/placed marker valid relative to its sibling. The B handle
  // can never be placed at or before A (the A < B invariant the engine
  // enforces), so clamp it to just past A — the handle visibly stops at the
  // boundary instead of snapping back silently when dropped before A.
  const clampForTarget = useCallback(
    (target: DragTarget, ms: number): number => {
      if (target === 'markerA' && markerB != null) {
        return Math.max(0, Math.min(ms, markerB - 1));
      }
      if (target === 'markerB' && markerA != null) {
        return Math.min(durationMs, Math.max(ms, markerA + 1));
      }
      return ms;
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
    (x: number) => {
      dragTarget.current = detectDragTarget(x);
      const raw = positionFromX(x);
      if (raw == null) return;
      const ms = clampForTarget(dragTarget.current, raw);
      setDragMs(ms);
      dragThrottle.begin(ms, callbackForTarget(dragTarget.current));
    },
    [
      detectDragTarget,
      positionFromX,
      clampForTarget,
      callbackForTarget,
      dragThrottle,
    ],
  );

  // Drag move: update the visual every frame, but throttle native calls.
  const moveDrag = useCallback(
    (x: number) => {
      const raw = positionFromX(x);
      if (raw == null) return;
      const ms = clampForTarget(dragTarget.current, raw);
      setDragMs(ms);
      dragThrottle.move(ms);
    },
    [positionFromX, clampForTarget, dragThrottle],
  );

  // Drag end (or interruption): commit the final value, then drop back to
  // the prop-driven visual.
  const endDrag = useCallback(() => {
    dragThrottle.end();
    setDragMs(null);
  }, [dragThrottle]);

  // Route the gesture through refs to the latest callbacks so the Pan object
  // itself is created once. A marker drag updates markerA/markerB mid-gesture
  // (throttled), which would otherwise rebuild the gesture ~20x/sec and risk
  // RNGH dropping the active drag.
  const beginRef = useRef(beginDrag);
  const moveRef = useRef(moveDrag);
  const endRef = useRef(endDrag);
  beginRef.current = beginDrag;
  moveRef.current = moveDrag;
  endRef.current = endDrag;

  // A single Pan drives taps and drags. `minDistance(0)` makes it claim the
  // touch the instant a finger lands on the waveform, so the surrounding
  // ScrollView can't steal a drag (the bug where markers wouldn't move).
  // `runOnJS` keeps the callbacks on the JS thread so they can touch React
  // state and the throttle directly.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => beginRef.current(e.x))
        .onUpdate((e) => moveRef.current(e.x))
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
      elements.push(
        <View
          key={`${key}-line`}
          pointerEvents="none"
          style={[
            styles.markerLine,
            { left: `${leftPct}%`, backgroundColor: color },
          ]}
          accessibilityLabel={`Loop ${label} marker at ${formatDuration(ms)}`}
        />,
      );
      // A dot where the line meets the bars, plus a labelled flag at the top.
      // Together they make the otherwise-invisible drag affordance obvious and
      // give the finger a clear target to grab.
      elements.push(
        <View
          key={`${key}-dot`}
          pointerEvents="none"
          style={[
            styles.markerDot,
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
            { left: `${leftPct}%`, backgroundColor: color },
          ]}
        >
          <Text style={[styles.markerHandleText, { color: textColor }]}>
            {label === 'start' ? 'A' : 'B'}
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
      }
    },
    [durationMs, positionMs, onSeek],
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
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <GestureDetector gesture={pan}>
        <View style={styles.touchArea} onLayout={handleLayout}>
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
    borderRadius: 14,
    overflow: 'hidden',
  },
  touchArea: {
    height: WAVEFORM_HEIGHT,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  track: {
    flex: 1,
    marginHorizontal: HORIZONTAL_PADDING,
    position: 'relative',
  },
  barsContainer: {
    position: 'absolute',
    top: HANDLE_HEIGHT + 6,
    bottom: spacing.sm,
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
    top: HANDLE_HEIGHT + 4,
    bottom: spacing.xs,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  markerLine: {
    position: 'absolute',
    top: HANDLE_HEIGHT + 2,
    bottom: spacing.xs,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  markerDot: {
    position: 'absolute',
    top: HANDLE_HEIGHT,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
  },
  markerHandle: {
    position: 'absolute',
    top: 0,
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    marginLeft: -HANDLE_WIDTH / 2,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerHandleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  markerRegion: {
    position: 'absolute',
    top: HANDLE_HEIGHT + 2,
    bottom: spacing.xs,
  },
});

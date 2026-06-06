import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

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
  onMarkerAChange?: (positionMs: number) => void;
  onMarkerBChange?: (positionMs: number) => void;
  style?: ViewStyle;
}

const WAVEFORM_HEIGHT = 120;
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const MARKER_HIT_ZONE_PX = 20;
const SEEK_STEP_MS = 5000;
const HORIZONTAL_PADDING = spacing.md;

type DragTarget = 'markerA' | 'markerB' | 'seek';

export function WaveformView({
  peaks,
  positionMs,
  durationMs,
  onSeek,
  markerA,
  markerB,
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

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    containerWidth.current = e.nativeEvent.layout.width;
  }, []);

  // The bars are inset by HORIZONTAL_PADDING on each side, so the
  // touchable track spans containerWidth - 2 * HORIZONTAL_PADDING.
  const trackWidth = () => containerWidth.current - 2 * HORIZONTAL_PADDING;

  const positionFromEvent = useCallback(
    (e: GestureResponderEvent): number | null => {
      if (durationMs <= 0 || trackWidth() <= 0) return null;
      const ratio = Math.max(
        0,
        Math.min(
          1,
          (e.nativeEvent.locationX - HORIZONTAL_PADDING) / trackWidth(),
        ),
      );
      return Math.round(ratio * durationMs);
    },
    [durationMs],
  );

  const detectDragTarget = useCallback(
    (e: GestureResponderEvent): DragTarget => {
      if (trackWidth() <= 0 || durationMs <= 0) return 'seek';
      const touchX = e.nativeEvent.locationX;

      if (markerA != null && onMarkerAChange) {
        const markerAX =
          HORIZONTAL_PADDING + (markerA / durationMs) * trackWidth();
        if (Math.abs(touchX - markerAX) <= MARKER_HIT_ZONE_PX) return 'markerA';
      }
      if (markerB != null && onMarkerBChange) {
        const markerBX =
          HORIZONTAL_PADDING + (markerB / durationMs) * trackWidth();
        if (Math.abs(touchX - markerBX) <= MARKER_HIT_ZONE_PX) return 'markerB';
      }
      return 'seek';
    },
    [durationMs, markerA, markerB, onMarkerAChange, onMarkerBChange],
  );

  // Keep a dragged marker valid relative to its sibling. The B handle can
  // never be placed at or before A (the A < B invariant the engine enforces),
  // so clamp it to just past A — the handle visibly stops at the boundary
  // instead of snapping back silently when dropped before A.
  const clampForTarget = useCallback(
    (target: DragTarget, ms: number): number => {
      if (target === 'markerB' && markerA != null) {
        return Math.min(durationMs, Math.max(ms, markerA + 1));
      }
      return ms;
    },
    [markerA, durationMs],
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
  const handleGrant = useCallback(
    (e: GestureResponderEvent) => {
      dragTarget.current = detectDragTarget(e);
      const raw = positionFromEvent(e);
      if (raw == null) return;
      const ms = clampForTarget(dragTarget.current, raw);
      setDragMs(ms);
      dragThrottle.begin(ms, callbackForTarget(dragTarget.current));
    },
    [
      detectDragTarget,
      positionFromEvent,
      clampForTarget,
      callbackForTarget,
      dragThrottle,
    ],
  );

  // Drag move: update the visual every frame, but throttle native calls.
  const handleMove = useCallback(
    (e: GestureResponderEvent) => {
      const raw = positionFromEvent(e);
      if (raw == null) return;
      const ms = clampForTarget(dragTarget.current, raw);
      setDragMs(ms);
      dragThrottle.move(ms);
    },
    [positionFromEvent, clampForTarget, dragThrottle],
  );

  // Drag end (or interruption): commit the final value, then drop back to
  // the prop-driven visual.
  const handleRelease = useCallback(() => {
    dragThrottle.end();
    setDragMs(null);
  }, [dragThrottle]);

  const bars = useMemo(() => {
    if (peaks.length === 0) return null;

    return peaks.map((peak, index) => {
      const barProgress = index / peaks.length;
      const isPlayed = barProgress <= progress;

      return (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: `${peak * 100}%`,
              backgroundColor: isPlayed
                ? theme.colors.accent
                : theme.colors.border,
            },
          ]}
        />
      );
    });
  }, [peaks, progress, theme.colors.accent, theme.colors.border]);

  const markerElements = useMemo(() => {
    if (durationMs <= 0) return null;
    const elements: React.ReactNode[] = [];

    if (
      displayMarkerA != null &&
      displayMarkerB != null &&
      displayMarkerA < displayMarkerB
    ) {
      const leftPct = (displayMarkerA / durationMs) * 100;
      const widthPct = ((displayMarkerB - displayMarkerA) / durationMs) * 100;
      elements.push(
        <View
          key="ab-region"
          style={[
            styles.markerRegion,
            {
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              backgroundColor: theme.colors.accent + '1A',
            },
          ]}
        />,
      );
    }

    if (displayMarkerA != null) {
      elements.push(
        <View
          key="marker-a"
          style={[
            styles.markerLine,
            {
              left: `${(displayMarkerA / durationMs) * 100}%`,
              backgroundColor: theme.colors.textSecondary,
            },
          ]}
          accessibilityLabel={`Loop start marker at ${formatDuration(displayMarkerA)}`}
        />,
      );
    }

    if (displayMarkerB != null) {
      elements.push(
        <View
          key="marker-b"
          style={[
            styles.markerLine,
            {
              left: `${(displayMarkerB / durationMs) * 100}%`,
              backgroundColor: theme.colors.textSecondary,
            },
          ]}
          accessibilityLabel={`Loop end marker at ${formatDuration(displayMarkerB)}`}
        />,
      );
    }

    return elements;
  }, [
    displayMarkerA,
    displayMarkerB,
    durationMs,
    theme.colors.accent,
    theme.colors.textSecondary,
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
      <View
        style={styles.touchArea}
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleGrant}
        onResponderMove={handleMove}
        onResponderRelease={handleRelease}
        onResponderTerminate={handleRelease}
      >
        <View style={styles.track}>
          <View style={styles.barsContainer}>{bars}</View>

          {markerElements}

          <View
            style={[
              styles.cursor,
              {
                left: `${progress * 100}%`,
                backgroundColor: theme.colors.accent,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
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
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 1,
    minHeight: 2,
  },
  cursor: {
    position: 'absolute',
    top: spacing.xs,
    bottom: spacing.xs,
    width: 2,
    borderRadius: 1,
  },
  markerLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
  },
  markerRegion: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});

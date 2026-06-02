import React, { useCallback, useMemo, useRef } from 'react';
import {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

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
  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    containerWidth.current = e.nativeEvent.layout.width;
  }, []);

  // The bars are inset by HORIZONTAL_PADDING on each side, so the
  // touchable track spans containerWidth - 2 * HORIZONTAL_PADDING.
  const trackWidth = useCallback(
    () => containerWidth.current - 2 * HORIZONTAL_PADDING,
    [],
  );

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
    [durationMs, trackWidth],
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
    [
      durationMs,
      markerA,
      markerB,
      onMarkerAChange,
      onMarkerBChange,
      trackWidth,
    ],
  );

  const handleGrant = useCallback(
    (e: GestureResponderEvent) => {
      dragTarget.current = detectDragTarget(e);
      const ms = positionFromEvent(e);
      if (ms == null) return;

      if (dragTarget.current === 'markerA') {
        onMarkerAChange?.(ms);
      } else if (dragTarget.current === 'markerB') {
        onMarkerBChange?.(ms);
      } else {
        onSeek(ms);
      }
    },
    [
      detectDragTarget,
      positionFromEvent,
      onSeek,
      onMarkerAChange,
      onMarkerBChange,
    ],
  );

  const handleMove = useCallback(
    (e: GestureResponderEvent) => {
      const ms = positionFromEvent(e);
      if (ms == null) return;

      if (dragTarget.current === 'markerA') {
        onMarkerAChange?.(ms);
      } else if (dragTarget.current === 'markerB') {
        onMarkerBChange?.(ms);
      } else {
        onSeek(ms);
      }
    },
    [positionFromEvent, onSeek, onMarkerAChange, onMarkerBChange],
  );

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

    if (markerA != null && markerB != null && markerA < markerB) {
      const leftPct = (markerA / durationMs) * 100;
      const widthPct = ((markerB - markerA) / durationMs) * 100;
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

    if (markerA != null) {
      elements.push(
        <View
          key="marker-a"
          style={[
            styles.markerLine,
            {
              left: `${(markerA / durationMs) * 100}%`,
              backgroundColor: theme.colors.textSecondary,
            },
          ]}
          accessibilityLabel={`Loop start marker at ${formatDuration(markerA)}`}
        />,
      );
    }

    if (markerB != null) {
      elements.push(
        <View
          key="marker-b"
          style={[
            styles.markerLine,
            {
              left: `${(markerB / durationMs) * 100}%`,
              backgroundColor: theme.colors.textSecondary,
            },
          ]}
          accessibilityLabel={`Loop end marker at ${formatDuration(markerB)}`}
        />,
      );
    }

    return elements;
  }, [
    markerA,
    markerB,
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

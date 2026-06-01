import React, { useCallback, useMemo, useRef } from 'react';
import {
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
  style?: ViewStyle;
}

const WAVEFORM_HEIGHT = 120;
const BAR_WIDTH = 2;
const BAR_GAP = 1;

export function WaveformView({
  peaks,
  positionMs,
  durationMs,
  onSeek,
  markerA,
  markerB,
  style,
}: WaveformViewProps) {
  const { theme } = useTheme();
  const containerWidth = useRef(0);
  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    containerWidth.current = e.nativeEvent.layout.width;
  }, []);

  const seekFromEvent = useCallback(
    (e: GestureResponderEvent) => {
      if (durationMs <= 0 || containerWidth.current <= 0) return;
      const ratio = Math.max(
        0,
        Math.min(1, e.nativeEvent.locationX / containerWidth.current),
      );
      onSeek(Math.round(ratio * durationMs));
    },
    [durationMs, onSeek],
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

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface },
        style,
      ]}
      accessibilityRole="adjustable"
      accessibilityLabel={`Waveform. Playback position: ${formatDuration(positionMs)} of ${formatDuration(durationMs)}`}
    >
      <View
        style={styles.touchArea}
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={seekFromEvent}
        onResponderMove={seekFromEvent}
      >
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  barsContainer: {
    flex: 1,
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

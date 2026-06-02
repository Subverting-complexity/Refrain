import React, { useCallback, useRef } from 'react';
import {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { formatDuration } from '../utils/formatTime';

const SEEK_STEP_MS = 5000;

interface SeekBarProps {
  positionMs: number;
  durationMs: number;
  onSeek: (positionMs: number) => void;
  style?: ViewStyle;
}

export function SeekBar({
  positionMs,
  durationMs,
  onSeek,
  style,
}: SeekBarProps) {
  const { theme } = useTheme();
  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const trackWidth = useRef(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  }, []);

  const seekFromEvent = useCallback(
    (e: GestureResponderEvent) => {
      if (durationMs <= 0 || trackWidth.current <= 0) return;
      const ratio = Math.max(
        0,
        Math.min(1, e.nativeEvent.locationX / trackWidth.current),
      );
      onSeek(Math.round(ratio * durationMs));
    },
    [durationMs, onSeek],
  );

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

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="adjustable"
      accessibilityLabel={`Playback position: ${formatDuration(positionMs)} of ${formatDuration(durationMs)}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <View
        style={styles.barTouchArea}
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={seekFromEvent}
        onResponderMove={seekFromEvent}
      >
        <View
          style={[styles.barTrack, { backgroundColor: theme.colors.border }]}
        >
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: theme.colors.accent,
                width: `${progress * 100}%`,
              },
            ]}
          />
        </View>
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: theme.colors.accent,
              left: `${progress * 100}%`,
            },
          ]}
        />
      </View>
      <View style={styles.timeRow}>
        <Text style={[styles.time, { color: theme.colors.textSecondary }]}>
          {formatDuration(positionMs)}
        </Text>
        <Text style={[styles.time, { color: theme.colors.textSecondary }]}>
          {formatDuration(durationMs)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  barTouchArea: {
    paddingVertical: spacing.xl,
    position: 'relative',
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: 18,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  time: {
    fontSize: 12,
    lineHeight: 16,
  },
});

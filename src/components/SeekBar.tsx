import { useCallback } from 'react';
import {
  AccessibilityActionEvent,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { useSliderGesture } from '../hooks/useSliderGesture';
import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { formatDuration } from '../utils/formatTime';
import { SliderBar } from './SliderBar';

const SEEK_STEP_MS = 5000;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

interface SeekBarProps {
  positionMs: number;
  durationMs: number;
  onSeek: (positionMs: number) => void;
  /**
   * When both are provided and `rangeStartMs < rangeEndMs`, the bar represents
   * only the A/B region: the fill shows how far through [start, end] the
   * playhead is, the time labels read elapsed-in-region / region-length, and
   * seeking maps within the region. Omit (or pass an invalid range) to span
   * the whole track.
   */
  rangeStartMs?: number;
  rangeEndMs?: number;
  style?: ViewStyle;
}

export function SeekBar({
  positionMs,
  durationMs,
  onSeek,
  rangeStartMs,
  rangeEndMs,
  style,
}: SeekBarProps) {
  const { theme } = useTheme();

  const hasRange =
    rangeStartMs != null &&
    rangeEndMs != null &&
    rangeEndMs > rangeStartMs &&
    durationMs > 0;
  const baseMs = hasRange ? (rangeStartMs as number) : 0;
  const spanMs = hasRange ? (rangeEndMs as number) - baseMs : durationMs;

  const elapsedMs = clamp(positionMs, baseMs, baseMs + spanMs) - baseMs;
  const progress = spanMs > 0 ? elapsedMs / spanMs : 0;

  const positionFromRatio = useCallback(
    (ratio: number): number => Math.round(baseMs + ratio * spanMs),
    [baseMs, spanMs],
  );

  const handleValueChange = useCallback(
    (ratio: number) => {
      onSeek(positionFromRatio(ratio));
    },
    [onSeek, positionFromRatio],
  );

  const { pan, handleLayout, dragRatio } = useSliderGesture({
    onValueChange: handleValueChange,
    enabled: spanMs > 0,
  });

  const displayProgress = dragRatio ?? progress;

  const handleAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (spanMs <= 0) return;
      const { actionName } = e.nativeEvent;
      if (actionName === 'increment') {
        onSeek(Math.min(baseMs + spanMs, positionMs + SEEK_STEP_MS));
      } else if (actionName === 'decrement') {
        onSeek(Math.max(baseMs, positionMs - SEEK_STEP_MS));
      }
    },
    [spanMs, baseMs, positionMs, onSeek],
  );

  const a11yLabel = hasRange
    ? `Loop position: ${formatDuration(elapsedMs)} of ${formatDuration(spanMs)}`
    : `Playback position: ${formatDuration(positionMs)} of ${formatDuration(durationMs)}`;

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="adjustable"
      accessibilityLabel={a11yLabel}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(displayProgress * 100),
      }}
    >
      <SliderBar
        progress={displayProgress}
        trackColor={theme.colors.border}
        fillColor={theme.colors.accentForeground}
        pan={pan}
        onLayout={handleLayout}
        paddingVertical={spacing.xl}
      />
      <View style={styles.timeRow}>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textSecondary },
          ]}
        >
          {formatDuration(hasRange ? elapsedMs : positionMs)}
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textSecondary },
          ]}
        >
          {formatDuration(hasRange ? spanMs : durationMs)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
});

import React, { useCallback, useMemo } from 'react';
import {
  AccessibilityActionEvent,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { useDerivedValue } from 'react-native-reanimated';

import { usePlayheadValue } from '../hooks/usePlayheadValue';
import { useSharedNumber } from '../hooks/useSharedNumber';
import { useDisplayRatio, useSliderGesture } from '../hooks/useSliderGesture';
import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { formatDuration } from '../utils/formatTime';
import { SliderBar } from './SliderBar';

const SEEK_STEP_MS = 5000;

// Module-level so the array identity never changes; see `a11yValue` below.
const STEP_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

interface SeekBarProps {
  positionMs: number;
  durationMs: number;
  /**
   * Whether the transport is running. Only the fill uses it: a playhead that is
   * advancing is drawn between the engine's reports rather than stepping to
   * each one. See {@link usePlayheadValue}.
   */
  isPlaying?: boolean;
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

/**
 * Memoised. It does follow the playhead, so a tick renders it — but the
 * player's other state (arming a marker, opening a sheet) must not.
 */
export const SeekBar = React.memo(function SeekBar({
  positionMs,
  durationMs,
  isPlaying = false,
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

  const { pan, handleLayout, trackWidth, dragRatio } = useSliderGesture({
    onValueChange: handleValueChange,
    enabled: spanMs > 0,
  });

  // The fill is drawn from the UI thread: the playhead glides between the
  // engine's ten reports a second, and a drag overrides it at the display's own
  // rate. Neither path re-renders this component — what re-renders it is the
  // clock below, once a second.
  const playhead = usePlayheadValue(positionMs, isPlaying);
  const baseValue = useSharedNumber(baseMs);
  const spanValue = useSharedNumber(spanMs);
  const settledRatio = useDerivedValue(() => {
    if (spanValue.value <= 0) return 0;
    const elapsed = playhead.value - baseValue.value;
    return Math.max(0, Math.min(1, elapsed / spanValue.value));
  });
  const displayRatio = useDisplayRatio(settledRatio, dragRatio);

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

  // Both of these were built inline, so each was a different object on every
  // render and the host view was handed a changed accessibility prop ten times
  // a second while playing and on every pointer event of a drag — for a set of
  // actions that never changes, and a percentage that changes a hundred times
  // across a whole track. The value memo keys on that rounded percentage
  // rather than on the position, or it would be rebuilt just as often.
  const a11yPercent = Math.round(progress * 100);
  const a11yValue = useMemo(
    () => ({ min: 0, max: 100, now: a11yPercent }),
    [a11yPercent],
  );

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="adjustable"
      accessibilityLabel={a11yLabel}
      accessibilityActions={STEP_ACTIONS}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityValue={a11yValue}
    >
      <SliderBar
        progress={displayRatio}
        trackWidth={trackWidth}
        trackColor={theme.colors.track}
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
});

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

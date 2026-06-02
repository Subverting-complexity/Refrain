import React, { useCallback, useRef, useState } from 'react';
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

// Throttle native seeks during drag to ~20/sec. The native bridge
// (setPositionAsync) is the bottleneck, not React, so the visual bar still
// updates every frame — only the native call is rate-limited.
const SEEK_THROTTLE_MS = 50;

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

  // While dragging, this local ratio drives the visual so the bar stays
  // smooth even though native seeks are throttled. null = not dragging.
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const lastSeekAt = useRef(0);
  const lastSeekPosition = useRef<number | null>(null);
  const pendingPosition = useRef<number | null>(null);
  const displayProgress = dragRatio ?? progress;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  }, []);

  const ratioFromEvent = useCallback(
    (e: GestureResponderEvent): number | null => {
      if (durationMs <= 0 || trackWidth.current <= 0) return null;
      return Math.max(
        0,
        Math.min(1, e.nativeEvent.locationX / trackWidth.current),
      );
    },
    [durationMs],
  );

  // Tap or drag start: update the visual and seek immediately (instant
  // tap-to-seek is preserved — no throttling on grant).
  const handleGrant = useCallback(
    (e: GestureResponderEvent) => {
      const ratio = ratioFromEvent(e);
      if (ratio === null) return;
      const position = Math.round(ratio * durationMs);
      setDragRatio(ratio);
      pendingPosition.current = position;
      lastSeekAt.current = Date.now();
      lastSeekPosition.current = position;
      onSeek(position);
    },
    [ratioFromEvent, durationMs, onSeek],
  );

  // Drag move: update the visual every frame, but throttle native seeks.
  const handleMove = useCallback(
    (e: GestureResponderEvent) => {
      const ratio = ratioFromEvent(e);
      if (ratio === null) return;
      const position = Math.round(ratio * durationMs);
      setDragRatio(ratio);
      pendingPosition.current = position;
      const now = Date.now();
      if (now - lastSeekAt.current >= SEEK_THROTTLE_MS) {
        lastSeekAt.current = now;
        lastSeekPosition.current = position;
        onSeek(position);
      }
    },
    [ratioFromEvent, durationMs, onSeek],
  );

  // Drag end (or interruption): fire one final, unthrottled seek so the
  // committed position is accurate, then drop back to the prop-driven visual.
  // Skip it when the last position was already seeked (e.g. a pure tap, or a
  // drag whose final move wasn't throttled) to avoid a redundant native call.
  const handleRelease = useCallback(() => {
    if (
      pendingPosition.current !== null &&
      pendingPosition.current !== lastSeekPosition.current
    ) {
      onSeek(pendingPosition.current);
    }
    pendingPosition.current = null;
    lastSeekPosition.current = null;
    setDragRatio(null);
  }, [onSeek]);

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
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(displayProgress * 100),
      }}
    >
      <View
        style={styles.barTouchArea}
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleGrant}
        onResponderMove={handleMove}
        onResponderRelease={handleRelease}
        onResponderTerminate={handleRelease}
      >
        <View
          style={[styles.barTrack, { backgroundColor: theme.colors.border }]}
        >
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: theme.colors.accent,
                width: `${displayProgress * 100}%`,
              },
            ]}
          />
        </View>
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: theme.colors.accent,
              left: `${displayProgress * 100}%`,
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

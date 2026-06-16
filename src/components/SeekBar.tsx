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
import { formatDuration } from '../utils/formatTime';

const SEEK_STEP_MS = 5000;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

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
  const seekThrottle = useDragThrottle();
  const displayProgress = dragRatio ?? progress;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  }, []);

  const ratioFromX = useCallback(
    (x: number): number | null => {
      if (durationMs <= 0 || trackWidth.current <= 0) return null;
      return clamp(x / trackWidth.current, 0, 1);
    },
    [durationMs],
  );

  // Tap or drag start: update the visual and seek immediately (instant
  // tap-to-seek is preserved — no throttling on grant).
  const beginDrag = useCallback(
    (x: number) => {
      const ratio = ratioFromX(x);
      if (ratio === null) return;
      setDragRatio(ratio);
      seekThrottle.begin(Math.round(ratio * durationMs), onSeek);
    },
    [ratioFromX, durationMs, onSeek, seekThrottle],
  );

  // Drag move: update the visual every frame, but throttle native seeks.
  const moveDrag = useCallback(
    (x: number) => {
      const ratio = ratioFromX(x);
      if (ratio === null) return;
      setDragRatio(ratio);
      seekThrottle.move(Math.round(ratio * durationMs));
    },
    [ratioFromX, durationMs, seekThrottle],
  );

  // Drag end (or interruption): commit the final seek, then drop back to
  // the prop-driven visual.
  const endDrag = useCallback(() => {
    seekThrottle.end();
    setDragRatio(null);
  }, [seekThrottle]);

  // Route through refs so the Pan is created once (see WaveformView).
  const beginRef = useRef(beginDrag);
  const moveRef = useRef(moveDrag);
  const endRef = useRef(endDrag);
  beginRef.current = beginDrag;
  moveRef.current = moveDrag;
  endRef.current = endDrag;

  // Mirror WaveformView: a single Pan with `minDistance(0)` claims the touch
  // immediately so the surrounding ScrollView can't steal a scrub, and
  // `runOnJS` keeps the callbacks on the JS thread for React state/throttle.
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
      <GestureDetector gesture={pan}>
        <View style={styles.barTouchArea} onLayout={handleLayout}>
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
      </GestureDetector>
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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

  // Resolve the active domain: the A/B region when a valid range is supplied,
  // otherwise the whole track. `baseMs` is the domain's start, `spanMs` its
  // length — both bar geometry and seeking are expressed against these so the
  // track-wide and region-scoped cases share one code path.
  const hasRange =
    rangeStartMs != null &&
    rangeEndMs != null &&
    rangeEndMs > rangeStartMs &&
    durationMs > 0;
  const baseMs = hasRange ? (rangeStartMs as number) : 0;
  const spanMs = hasRange ? (rangeEndMs as number) - baseMs : durationMs;

  const elapsedMs = clamp(positionMs, baseMs, baseMs + spanMs) - baseMs;
  const progress = spanMs > 0 ? elapsedMs / spanMs : 0;
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
      if (spanMs <= 0 || trackWidth.current <= 0) return null;
      return clamp(x / trackWidth.current, 0, 1);
    },
    [spanMs],
  );

  // Map a 0..1 ratio to an absolute seek position inside the active domain.
  const positionFromRatio = useCallback(
    (ratio: number): number => Math.round(baseMs + ratio * spanMs),
    [baseMs, spanMs],
  );

  // Tap or drag start: update the visual and seek immediately (instant
  // tap-to-seek is preserved — no throttling on grant).
  const beginDrag = useCallback(
    (x: number) => {
      const ratio = ratioFromX(x);
      if (ratio === null) return;
      setDragRatio(ratio);
      seekThrottle.begin(positionFromRatio(ratio), onSeek);
    },
    [ratioFromX, positionFromRatio, onSeek, seekThrottle],
  );

  // Drag move: update the visual every frame, but throttle native seeks.
  const moveDrag = useCallback(
    (x: number) => {
      const ratio = ratioFromX(x);
      if (ratio === null) return;
      setDragRatio(ratio);
      seekThrottle.move(positionFromRatio(ratio));
    },
    [ratioFromX, positionFromRatio, seekThrottle],
  );

  // Drag end (or interruption): commit the final seek, then drop back to
  // the prop-driven visual.
  const endDrag = useCallback(() => {
    seekThrottle.end();
    setDragRatio(null);
  }, [seekThrottle]);

  // Route through refs so the Pan is created once (see WaveformView). The refs
  // hold the latest callbacks; the Pan reads them at gesture time so it never
  // has to be rebuilt. Writes happen in an effect (not during render).
  const beginRef = useRef(beginDrag);
  const moveRef = useRef(moveDrag);
  const endRef = useRef(endDrag);
  useEffect(() => {
    beginRef.current = beginDrag;
    moveRef.current = moveDrag;
    endRef.current = endDrag;
  });

  // Mirror WaveformView: a single Pan with `minDistance(0)` claims the touch
  // immediately so the surrounding ScrollView can't steal a scrub, and
  // `runOnJS` keeps the callbacks on the JS thread for React state/throttle.
  // RNGH invokes these callbacks on touch (after render), never during render,
  // so reading the latest-callback refs here is safe — the rule can't see that
  // onBegin/onUpdate/onFinalize defer execution.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onBegin((e) => beginRef.current(e.x))
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onUpdate((e) => moveRef.current(e.x))
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onFinalize(() => endRef.current()),
    [],
  );

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
          {formatDuration(hasRange ? elapsedMs : positionMs)}
        </Text>
        <Text style={[styles.time, { color: theme.colors.textSecondary }]}>
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

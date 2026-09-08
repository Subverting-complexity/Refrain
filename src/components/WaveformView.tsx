import React, { useCallback, useMemo, useState } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityInfo,
  LayoutChangeEvent,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import { usePlayheadValue } from '../hooks/usePlayheadValue';
import { useSharedNumber } from '../hooks/useSharedNumber';
import { useTheme } from '../hooks/useTheme';
import {
  NO_MARKER,
  TARGET_MARKER_A,
  TARGET_MARKER_B,
  TARGET_SEEK,
  useWaveformGesture,
} from '../hooks/useWaveformGesture';
import { radii, spacing } from '../theme';
import { WaveformPeaks } from '../types';
import { formatDuration } from '../utils/formatTime';
import { WaveformBars } from './WaveformBars';
import { MARKER_LINE_HALO, WaveformMarkers } from './WaveformMarkers';
import {
  barCountForTrackWidth,
  downsamplePeaks,
  HANDLE_ZONE,
  HORIZONTAL_PADDING,
  snapDownToBarGrid,
  snapUpToBarGrid,
  trackOffsetPx,
  waveformHeightForViewport,
} from './waveformLayout';

interface WaveformViewProps {
  peaks: WaveformPeaks;
  positionMs: number;
  durationMs: number;
  /**
   * Whether the transport is running, so the playhead can be drawn between the
   * engine's reports instead of stepping to each one. See
   * {@link usePlayheadValue}.
   */
  isPlaying?: boolean;
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
  /**
   * The arm state for tap-to-place. When `'none'` (default), a tap on the wave
   * only seeks. When `'A'` or `'B'`, the next tap drops that marker where you
   * touch. Existing handles stay draggable regardless of this. The arming flow
   * is driven from the A/B buttons in MarkerControls.
   */
  placeMode?: 'none' | 'A' | 'B';
  /**
   * Fired once a tap-to-place placement completes, with which marker was
   * placed, so the parent can advance the arm state (A → B, then B → none).
   * Not called for fine-tune drags of an already-placed handle.
   */
  onPlaceComplete?: (marker: 'A' | 'B') => void;
  /**
   * Fired once a marker edit is committed — on release of a tap-to-place *or*
   * a fine-tune drag, and after an accessibility place action — so the parent
   * can park the playhead at the loop start. Distinct from `onPlaceComplete`,
   * which is placement-only because it drives the arm state; nudging an
   * existing handle must move the playhead without re-arming anything.
   *
   * `onMarkerAChange`/`onMarkerBChange` fire throughout the drag and so cannot
   * carry this: seeking at drag cadence scrubs badly (see `updateMonitor`).
   */
  onMarkerCommit?: (marker: 'A' | 'B') => void;
  onMarkerAChange?: (positionMs: number) => void;
  onMarkerBChange?: (positionMs: number) => void;
  /**
   * Snippet-preview hooks for the engine's rolling monitor. Fired only for
   * marker gestures (dragging an existing A/B handle, or a tap-to-place), never
   * for plain seeks. `onPreviewStart` runs once when the gesture grabs/places a
   * marker; `onPreviewMove` follows the marker at the same throttled cadence as
   * the marker callback; `onPreviewEnd` runs on release. Omit them (the player
   * passes nothing when the preference is off) to disable the preview — dragging
   * then behaves exactly as before.
   */
  onPreviewStart?: (centerMs: number) => void;
  onPreviewMove?: (centerMs: number) => void;
  onPreviewEnd?: () => void;
  /**
   * Overall height of the waveform surface. Omit it — the player does — and
   * the surface scales itself to the viewport, so it fills the available space
   * instead of sitting small and boxed-in. See
   * {@link waveformHeightForViewport}.
   *
   * Reading the viewport here rather than in the player is deliberate: on
   * Android a metric change arrives for every inset and soft-keyboard event,
   * and subscribing from the screen re-rendered the screen and everything
   * under it for a height that had not changed.
   */
  height?: number;
  style?: ViewStyle;
}

const SEEK_STEP_MS = 5000;

interface CursorProps {
  /** Playhead offset along the track, in pixels. */
  offsetX: SharedValue<number>;
  color: string;
  edgeColor: string;
}

/**
 * The playhead line.
 *
 * Translated along the track from a shared value, so it follows both the
 * engine and a finger on the UI thread — no render, and no layout pass. It was
 * previously placed with a percentage `left`, which meant Yoga ran over the
 * whole surface ten times a second while playing and on every pointer event of
 * a drag; on Android that is the work that showed as stutter.
 */
const Cursor = React.memo(function Cursor({
  offsetX,
  color,
  edgeColor,
}: CursorProps) {
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.noPointerEvents,
        styles.cursor,
        { backgroundColor: color, borderColor: edgeColor },
        slide,
      ]}
    />
  );
});

/**
 * The waveform surface: a touch target wrapping the bars, the A/B overlay, and
 * the playhead. Touch behaviour lives in {@link useWaveformGesture} and the
 * drawing in `WaveformBars`/`WaveformMarkers`.
 *
 * ## What moves where
 *
 * Everything that moves continuously — the playhead, the marker handles and
 * their lines, the loop wash — is positioned by a translation driven from a
 * shared value, so it is drawn on the UI thread at the display's own rate and
 * costs neither a React render nor a layout pass.
 *
 * The bars are the exception, and are still drawn by React. They can be,
 * because a bar changes colour only when an edge crosses its centre: about once
 * a second on a three-minute track, and during a drag at the throttled cadence
 * the engine echoes positions back at. The fractions handed to them are snapped
 * to the bar grid so a movement that cannot change the picture cannot change
 * the props either, and the memo below holds.
 */
export const WaveformView = React.memo(function WaveformView({
  peaks,
  positionMs,
  durationMs,
  isPlaying = false,
  onSeek,
  markerA,
  markerB,
  loopEnabled = true,
  placeMode = 'none',
  onPlaceComplete,
  onMarkerCommit,
  onMarkerAChange,
  onMarkerBChange,
  onPreviewStart,
  onPreviewMove,
  onPreviewEnd,
  height: heightProp,
  style,
}: WaveformViewProps) {
  const { theme } = useTheme();
  const { height: viewportHeight, width: viewportWidth } =
    useWindowDimensions();
  const height = heightProp ?? waveformHeightForViewport(viewportHeight);

  const {
    gesture,
    onLayout: measureGesture,
    trackWidth,
    dragTarget,
    dragMs,
    markerAValue,
    markerBValue,
  } = useWaveformGesture({
    durationMs,
    height,
    markerA,
    markerB,
    placeMode,
    onSeek,
    onMarkerAChange,
    onMarkerBChange,
    onPlaceComplete,
    onMarkerCommit,
    onPreviewStart,
    onPreviewMove,
    onPreviewEnd,
  });

  // The track width is needed on both sides of the thread boundary: by the
  // worklets, to turn a touch into a position, and here, to decide how many
  // bars will fit. The gesture hook owns the shared value; this is the React
  // copy, and it is written only when the number actually changes, so a layout
  // pass that reports the same width costs nothing.
  const [measuredTrack, setMeasuredTrack] = useState(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      measureGesture(e);
      const width = Math.max(
        0,
        e.nativeEvent.layout.width - 2 * HORIZONTAL_PADDING,
      );
      setMeasuredTrack((previous) => (previous === width ? previous : width));
    },
    [measureGesture],
  );

  // Before the first layout the viewport stands in for the track, which is a
  // little wider than it and so errs towards more bars rather than an empty
  // first frame.
  const trackEstimate =
    measuredTrack > 0
      ? measuredTrack
      : Math.max(0, viewportWidth - 2 * HORIZONTAL_PADDING);
  const barCount = barCountForTrackWidth(trackEstimate, peaks.length);
  // The analyser produces two hundred buckets, which is the right resolution to
  // keep and more than a phone can draw; see `MIN_BAR_PITCH`.
  const displayPeaks = useMemo(
    () => downsamplePeaks(peaks, barCount),
    [peaks, barCount],
  );

  // The loop is "active" (and the fill scoped to A..B) only when both markers
  // exist, A precedes B, and looping is armed.
  const hasRegion =
    markerA != null && markerB != null && markerA < markerB && durationMs > 0;
  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const aFrac = hasRegion ? (markerA as number) / durationMs : 0;
  const bFrac = hasRegion ? (markerB as number) / durationMs : 0;
  const loopActive = hasRegion && loopEnabled;

  // What the bars are handed, snapped to their own grid. See `snapDownToBarGrid`.
  const displayBarCount = displayPeaks.length;
  const barsProgress = snapDownToBarGrid(progress, displayBarCount);
  const barsAFrac = hasRegion ? snapUpToBarGrid(aFrac, displayBarCount) : 0;
  const barsBFrac = hasRegion ? snapDownToBarGrid(bFrac, displayBarCount) : 0;

  // Where the overlays sit, resolved on the UI thread. While a drag is in
  // flight the dragged element follows the finger; everything else follows the
  // value the engine last reported.
  const playhead = usePlayheadValue(positionMs, isPlaying);
  const durationValue = useSharedNumber(durationMs);

  const cursorX = useDerivedValue(() => {
    const ms = dragTarget.value === TARGET_SEEK ? dragMs.value : playhead.value;
    return trackOffsetPx(ms, durationValue.value, trackWidth.value);
  });
  const markerAX = useDerivedValue(() => {
    const ms =
      dragTarget.value === TARGET_MARKER_A ? dragMs.value : markerAValue.value;
    if (ms === NO_MARKER) return 0;
    return trackOffsetPx(ms, durationValue.value, trackWidth.value);
  });
  const markerBX = useDerivedValue(() => {
    const ms =
      dragTarget.value === TARGET_MARKER_B ? dragMs.value : markerBValue.value;
    if (ms === NO_MARKER) return 0;
    return trackOffsetPx(ms, durationValue.value, trackWidth.value);
  });
  const regionWidth = useDerivedValue(() =>
    Math.max(0, markerBX.value - markerAX.value),
  );

  const handleAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (durationMs <= 0) return;
      const { actionName } = e.nativeEvent;
      if (actionName === 'increment') {
        onSeek(Math.min(durationMs, positionMs + SEEK_STEP_MS));
      } else if (actionName === 'decrement') {
        onSeek(Math.max(0, positionMs - SEEK_STEP_MS));
      } else if (actionName === 'placeA' && onMarkerAChange) {
        onMarkerAChange(positionMs);
        onMarkerCommit?.('A');
        AccessibilityInfo.announceForAccessibility(
          `A marker placed at ${formatDuration(positionMs)}`,
        );
      } else if (actionName === 'placeB' && onMarkerBChange) {
        onMarkerBChange(positionMs);
        // Unlike a drag, this path isn't clamped past A, so the engine can
        // reject it. Only a placement that actually lands may move the
        // playhead — otherwise a rejected B would jump to A having changed
        // nothing.
        if (markerA == null || positionMs > markerA) onMarkerCommit?.('B');
        AccessibilityInfo.announceForAccessibility(
          `B marker placed at ${formatDuration(positionMs)}`,
        );
      }
    },
    [
      durationMs,
      positionMs,
      markerA,
      onSeek,
      onMarkerAChange,
      onMarkerBChange,
      onMarkerCommit,
    ],
  );

  // Rebuilt only when a marker handler appears or disappears. Inline, this
  // array was a fresh one on every playback tick, so the container's props
  // never compared equal and the accessibility surface was re-registered ten
  // times a second for a set of actions that had not changed.
  const a11yActions = useMemo(
    () => [
      { name: 'increment' },
      { name: 'decrement' },
      ...(onMarkerAChange
        ? [{ name: 'placeA', label: 'Place A marker at current position' }]
        : []),
      ...(onMarkerBChange
        ? [{ name: 'placeB', label: 'Place B marker at current position' }]
        : []),
    ],
    [onMarkerAChange, onMarkerBChange],
  );

  // A fresh object here is a changed prop on the host view, so the platform
  // was handed a new accessibility value ten times a second while playing.
  // What it announces is a whole percentage, which changes a hundred times
  // across an entire track — so the memo keys on that rounded figure, not on
  // the position it came from.
  const a11yPercent = Math.round(progress * 100);
  const a11yValue = useMemo(
    () => ({ min: 0, max: 100, now: a11yPercent }),
    [a11yPercent],
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
      accessibilityHint="Swipe up or down to seek. Activate for more options including placing loop markers."
      accessibilityActions={a11yActions}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityValue={a11yValue}
    >
      <GestureDetector gesture={gesture}>
        <View style={[styles.touchArea, { height }]} onLayout={onLayout}>
          <View style={styles.track}>
            <WaveformBars
              peaks={displayPeaks}
              progress={barsProgress}
              hasRegion={hasRegion}
              aFrac={barsAFrac}
              bFrac={barsBFrac}
              loopActive={loopActive}
            />

            <WaveformMarkers
              durationMs={durationMs}
              markerA={markerA}
              markerB={markerB}
              hasRegion={hasRegion}
              markerAX={markerAX}
              markerBX={markerBX}
              regionX={markerAX}
              regionWidth={regionWidth}
            />

            <Cursor
              offsetX={cursorX}
              color={theme.colors.textPrimary}
              edgeColor={theme.colors.surface}
            />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  // The decorative overlays (region tint, marker lines/dots/flags, cursor) must
  // not swallow touches meant for the pan gesture. Carried as a style rather
  // than the `pointerEvents` prop, which React Native Web has deprecated.
  noPointerEvents: {
    pointerEvents: 'none',
  },
  container: {
    width: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  touchArea: {
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  track: {
    flex: 1,
    marginHorizontal: HORIZONTAL_PADDING,
    position: 'relative',
  },
  cursor: {
    position: 'absolute',
    left: 0,
    top: HANDLE_ZONE,
    bottom: HANDLE_ZONE,
    // Same edge treatment as the marker lines, for the same reason: the
    // playhead crosses all four bar tiers, and against the loudest bars its
    // own colour measures 1.16. The card-coloured edge carries the boundary
    // exactly where the cursor colour cannot. The 2px core is unchanged.
    width: 2 + MARKER_LINE_HALO * 2,
    marginLeft: -(1 + MARKER_LINE_HALO),
    borderLeftWidth: MARKER_LINE_HALO,
    borderRightWidth: MARKER_LINE_HALO,
    borderRadius: 1,
  },
});

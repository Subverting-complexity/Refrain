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

import { MarkerDrag } from '../hooks/useMarkerDrag';
import { useSharedNumber } from '../hooks/useSharedNumber';
import { useUiDerivedNumber } from '../hooks/useUiDerivedNumber';
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
  /**
   * The playhead, in milliseconds, as a shared value.
   *
   * A shared value rather than a number because this surface is one of the two
   * that draws it. Handed the number, the component had to re-render for the
   * playhead to move — ten times a second while playing, and at the drag's
   * cadence while scrubbing — and on the New Architecture every one of those
   * renders is mounted on the Android UI thread in the same pass that draws the
   * frame. The cursor now follows it from the UI thread, and the three coarse
   * things React still draws from it (the bar tiers, the announced percentage,
   * the spoken time) are projected with {@link useUiDerivedNumber} so each
   * re-renders at its own rate rather than the playhead's.
   */
  playheadMs: SharedValue<number>;
  durationMs: number;
  onSeek: (positionMs: number) => void;
  /**
   * A and B as the engine last committed them. They decide which markers exist
   * and name them for a screen reader; where each one is *drawn* comes from
   * {@link markerDrag} while a finger is on it.
   */
  markerA?: number;
  markerB?: number;
  /**
   * Where to publish an in-flight drag, so surfaces outside the waveform can
   * follow it. Pass the screen's own — the marker tiles read the same one — and
   * omit it for a waveform that stands alone. See {@link MarkerDrag}.
   */
  markerDrag?: MarkerDrag;
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
 * a second on a three-minute track. All three edges they are given — the
 * playhead and the region's two ends — are snapped to the bar grid on the UI
 * thread, so a movement that cannot change the picture cannot change the props
 * either, and the memo below holds. None of them is read from a prop: the
 * playhead and a dragged marker both live in shared values, and taking them
 * through React would put the screen back in the path of every pointer event.
 */
export const WaveformView = React.memo(function WaveformView({
  peaks,
  playheadMs,
  durationMs,
  onSeek,
  markerA,
  markerB,
  markerDrag,
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
    drag: markerDrag,
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
  // exist, A precedes B, and looping is armed. A drag cannot change any of
  // those: the handles are clamped so A stays before B, so the region survives
  // the whole gesture and only its edges move.
  const hasRegion =
    markerA != null && markerB != null && markerA < markerB && durationMs > 0;
  const loopActive = hasRegion && loopEnabled;

  const displayBarCount = displayPeaks.length;
  const playhead = playheadMs;
  const durationValue = useSharedNumber(durationMs);
  const barCountValue = useSharedNumber(displayBarCount);
  const hasRegionValue = useSharedNumber(hasRegion ? 1 : 0);

  // The playhead's grid position cannot be snapped here, because the playhead
  // is not here: it lives in a shared value and moves every frame. It is
  // snapped on the UI thread instead, and only a movement that actually
  // crosses a bar centre is allowed to re-render the bars — a few times a
  // second on a phone-width track, rather than ten.
  const deriveBarsProgress = useCallback(() => {
    'worklet';
    if (durationValue.value <= 0 || barCountValue.value <= 0) return 0;
    return snapDownToBarGrid(
      playhead.value / durationValue.value,
      barCountValue.value,
    );
  }, [playhead, durationValue, barCountValue]);
  const barsProgress = useUiDerivedNumber(deriveBarsProgress, 0);

  // The two figures the accessibility surface announces, each derived at the
  // rate it is actually spoken at: a whole percentage changes a hundred times
  // across a track, a whole second once a second. Feeding either of them
  // milliseconds re-registered the host view's accessibility props at the
  // engine's rate for a value that reads the same.
  const deriveA11yPercent = useCallback(() => {
    'worklet';
    if (durationValue.value <= 0) return 0;
    const ratio = playhead.value / durationValue.value;
    return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  }, [playhead, durationValue]);
  const a11yPercent = useUiDerivedNumber(deriveA11yPercent, 0);

  const deriveSpokenSecond = useCallback(() => {
    'worklet';
    return Math.floor(Math.max(0, playhead.value) / 1000);
  }, [playhead]);
  const spokenSecond = useUiDerivedNumber(deriveSpokenSecond, 0);

  // The region's two edges, snapped to the bar grid on the UI thread for the
  // same reason the playhead is: a dragged marker is not here — it is in a
  // shared value moving at the display's rate — and only a movement that
  // actually carries an edge across a bar centre can change the picture. Each
  // edge is derived on its own, so dragging A leaves B's derivation quiet.
  const deriveBarsAFrac = useCallback(() => {
    'worklet';
    if (
      hasRegionValue.value === 0 ||
      durationValue.value <= 0 ||
      barCountValue.value <= 0
    ) {
      return 0;
    }
    const ms =
      dragTarget.value === TARGET_MARKER_A ? dragMs.value : markerAValue.value;
    if (ms === NO_MARKER) return 0;
    return snapUpToBarGrid(ms / durationValue.value, barCountValue.value);
  }, [
    hasRegionValue,
    durationValue,
    barCountValue,
    dragTarget,
    dragMs,
    markerAValue,
  ]);
  const barsAFrac = useUiDerivedNumber(deriveBarsAFrac, 0);

  const deriveBarsBFrac = useCallback(() => {
    'worklet';
    if (
      hasRegionValue.value === 0 ||
      durationValue.value <= 0 ||
      barCountValue.value <= 0
    ) {
      return 0;
    }
    const ms =
      dragTarget.value === TARGET_MARKER_B ? dragMs.value : markerBValue.value;
    if (ms === NO_MARKER) return 0;
    return snapDownToBarGrid(ms / durationValue.value, barCountValue.value);
  }, [
    hasRegionValue,
    durationValue,
    barCountValue,
    dragTarget,
    dragMs,
    markerBValue,
  ]);
  const barsBFrac = useUiDerivedNumber(deriveBarsBFrac, 0);

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
      // Read the playhead now rather than closing over a rendered copy of it.
      // A shared value is readable from this thread, and taking it at the
      // moment the action fires is both more accurate and what lets this
      // callback stay stable while the playhead moves.
      const positionMs = playhead.value;
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
      playhead,
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
  // The memo keys on the rounded figure derived above, not on the position it
  // came from.
  const a11yValue = useMemo(
    () => ({ min: 0, max: 100, now: a11yPercent }),
    [a11yPercent],
  );

  const a11yLabel = useMemo(() => {
    let label = `Waveform. Playback position: ${formatDuration(spokenSecond * 1000)} of ${formatDuration(durationMs)}`;
    if (markerA != null && markerB != null) {
      label += `. Loop from ${formatDuration(markerA)} to ${formatDuration(markerB)}`;
    }
    return label;
  }, [spokenSecond, durationMs, markerA, markerB]);

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

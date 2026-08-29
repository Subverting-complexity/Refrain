import React, { useCallback, useMemo } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityInfo,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { useTheme } from '../hooks/useTheme';
import { useWaveformGesture } from '../hooks/useWaveformGesture';
import { radii, spacing } from '../theme';
import { WaveformPeaks } from '../types';
import { formatDuration } from '../utils/formatTime';
import { WaveformBars } from './WaveformBars';
import { MARKER_LINE_HALO, WaveformMarkers } from './WaveformMarkers';
import {
  DEFAULT_WAVEFORM_HEIGHT,
  HANDLE_ZONE,
  HORIZONTAL_PADDING,
} from './waveformLayout';

interface WaveformViewProps {
  peaks: WaveformPeaks;
  positionMs: number;
  durationMs: number;
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
   * Overall height of the waveform surface. Lets the player scale it to the
   * screen so it fills the available space instead of sitting small and
   * boxed-in. Defaults to {@link DEFAULT_WAVEFORM_HEIGHT}.
   */
  height?: number;
  style?: ViewStyle;
}

const SEEK_STEP_MS = 5000;

/**
 * The waveform surface: a touch target wrapping the bars, the A/B overlay, and
 * the playhead. Touch behaviour lives in {@link useWaveformGesture} and the
 * drawing in `WaveformBars`/`WaveformMarkers`; what remains here is resolving
 * the displayed values (prop-driven, or the live drag value while one is in
 * flight) and the accessibility surface.
 */
export function WaveformView({
  peaks,
  positionMs,
  durationMs,
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
  height = DEFAULT_WAVEFORM_HEIGHT,
  style,
}: WaveformViewProps) {
  const { theme } = useTheme();

  const { gesture, drag, onLayout } = useWaveformGesture({
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

  // While a drag is in flight the dragged element follows the finger every
  // frame; everything else stays on its prop value.
  const displayPositionMs = drag?.target === 'seek' ? drag.ms : positionMs;
  const displayMarkerA = drag?.target === 'markerA' ? drag.ms : markerA;
  const displayMarkerB = drag?.target === 'markerB' ? drag.ms : markerB;
  const progress = durationMs > 0 ? displayPositionMs / durationMs : 0;

  // The loop is "active" (and the fill scoped to A..B) only when both markers
  // exist, A precedes B, and looping is armed.
  const hasRegion =
    displayMarkerA != null &&
    displayMarkerB != null &&
    displayMarkerA < displayMarkerB &&
    durationMs > 0;
  const aFrac = hasRegion ? (displayMarkerA as number) / durationMs : 0;
  const bFrac = hasRegion ? (displayMarkerB as number) / durationMs : 0;
  const loopActive = hasRegion && loopEnabled;

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
      accessibilityActions={[
        { name: 'increment' },
        { name: 'decrement' },
        ...(onMarkerAChange
          ? [{ name: 'placeA', label: 'Place A marker at current position' }]
          : []),
        ...(onMarkerBChange
          ? [{ name: 'placeB', label: 'Place B marker at current position' }]
          : []),
      ]}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <GestureDetector gesture={gesture}>
        <View style={[styles.touchArea, { height }]} onLayout={onLayout}>
          <View style={styles.track}>
            <WaveformBars
              peaks={peaks}
              progress={progress}
              hasRegion={hasRegion}
              aFrac={aFrac}
              bFrac={bFrac}
              loopActive={loopActive}
            />

            <WaveformMarkers
              durationMs={durationMs}
              markerA={displayMarkerA}
              markerB={displayMarkerB}
              hasRegion={hasRegion}
            />

            <View
              style={[
                styles.noPointerEvents,
                styles.cursor,
                {
                  left: `${progress * 100}%`,
                  backgroundColor: theme.colors.textPrimary,
                  borderColor: theme.colors.surface,
                },
              ]}
            />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

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

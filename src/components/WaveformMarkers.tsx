import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useTheme } from '../hooks/useTheme';
import { withAlpha } from '../utils/color';
import { formatDuration } from '../utils/formatTime';
import { HANDLE_HEIGHT, HANDLE_WIDTH, HANDLE_ZONE } from './waveformLayout';

/**
 * How strongly the loop region is washed with the A marker's colour. Exported
 * so the contrast test measures the tint the component actually draws instead
 * of restating the number and letting the two drift apart.
 */
export const REGION_TINT_ALPHA = 0.05;

/**
 * Width of the edge drawn either side of a marker line, in the card's own
 * colour.
 *
 * A marker line is one colour crossing four bar tiers that span most of the
 * available luminance range, so no single line colour contrasts with all of
 * them: against the loop tier the A line measures 1.08 in light mode, which is
 * invisible. The edge is what fixes that, and it works because it fails where
 * the line succeeds. Against the three bright tiers the card colour carries
 * the boundary (4.4 to 11.0); against the dull tier, where the card colour is
 * closest, the line's own colour carries it (2.8 to 4.6).
 *
 * The core stays 2px, so the line is no heavier than it was.
 */
export const MARKER_LINE_HALO = 1;

export interface WaveformMarkersProps {
  durationMs: number;
  /**
   * Marker positions in ms, as the engine last reported them. They name the
   * markers for a screen reader and decide which are drawn at all; where each
   * one is drawn comes from the shared values below, which follow a finger at
   * the display's rate rather than at the engine's.
   */
  markerA?: number;
  markerB?: number;
  /** Whether A and B form a valid region, so the tint band should be drawn. */
  hasRegion: boolean;
  /** Each marker's offset along the track, in pixels. */
  markerAX: SharedValue<number>;
  markerBX: SharedValue<number>;
  /** The tinted region's left edge and width along the track, in pixels. */
  regionX: SharedValue<number>;
  regionWidth: SharedValue<number>;
}

interface MarkerProps {
  label: 'start' | 'end';
  ms: number;
  offsetX: SharedValue<number>;
  color: string;
  textColor: string;
  /** The colour of the edge that keeps the line legible over every bar tier. */
  haloColor: string;
}

/**
 * One marker: a line through the bars, a dot where the line meets them, and a
 * labelled flag. A's flag sits at the top and B's at the bottom, so the two
 * grab targets never stack on top of each other even when the markers are
 * close together.
 *
 * All three pieces are placed by translating them along the track from a shared
 * value, so a drag moves them on the UI thread without React rendering and
 * without a layout pass. They used to be placed with a percentage `left`, which
 * is a layout value: dragging a handle re-ran Yoga over the surface on every
 * pointer event.
 *
 * Memoised on top of that, so the renders that do happen — the engine echoing a
 * marker back at the drag's throttled cadence — cost nothing here.
 */
const Marker = React.memo(function Marker({
  label,
  ms,
  offsetX,
  color,
  textColor,
  haloColor,
}: MarkerProps) {
  const isStart = label === 'start';
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  return (
    <>
      <Animated.View
        style={[
          styles.noPointerEvents,
          isStart ? styles.markerLineStart : styles.markerLineEnd,
          { backgroundColor: color, borderColor: haloColor },
          slide,
        ]}
        accessibilityLabel={`Loop ${label} marker at ${formatDuration(ms)}`}
      />
      <Animated.View
        style={[
          styles.noPointerEvents,
          isStart ? styles.markerDotStart : styles.markerDotEnd,
          { backgroundColor: color },
          slide,
        ]}
      />
      <Animated.View
        style={[
          styles.noPointerEvents,
          styles.markerHandle,
          isStart ? styles.markerHandleStart : styles.markerHandleEnd,
          { backgroundColor: color },
          slide,
        ]}
      >
        <Text style={[styles.markerHandleText, { color: textColor }]}>
          {isStart ? 'A' : 'B'}
        </Text>
      </Animated.View>
    </>
  );
});

interface RegionProps {
  offsetX: SharedValue<number>;
  width: SharedValue<number>;
  color: string;
}

/**
 * The wash over the looped span.
 *
 * A one-pixel band scaled to the region's width rather than a band whose width
 * is set: a scale is resolved when the frame is drawn, where setting a width
 * would re-run layout on every pointer event of a marker drag. The band carries
 * no corner radius, so the scale is exact — there is no rounding for it to
 * distort.
 */
const Region = React.memo(function Region({
  offsetX,
  width,
  color,
}: RegionProps) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { scaleX: Math.max(0, width.value) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.noPointerEvents,
        styles.markerRegion,
        { backgroundColor: color },
        style,
      ]}
    />
  );
});

/**
 * The A/B overlay: the tinted loop region plus each marker's line, dot, and
 * flag. Purely presentational — positions arrive as pixel offsets along the
 * track and nothing here hit-tests or drags. Absolutely positioned, so it
 * expects a relative parent.
 */
export const WaveformMarkers = React.memo(function WaveformMarkers({
  durationMs,
  markerA,
  markerB,
  hasRegion,
  markerAX,
  markerBX,
  regionX,
  regionWidth,
}: WaveformMarkersProps) {
  const { theme } = useTheme();

  if (durationMs <= 0) return null;

  return (
    <>
      {hasRegion ? (
        <Region
          offsetX={regionX}
          width={regionWidth}
          color={withAlpha(theme.colors.markerA, REGION_TINT_ALPHA)}
        />
      ) : null}

      {markerA != null ? (
        <Marker
          label="start"
          ms={markerA}
          offsetX={markerAX}
          color={theme.colors.markerA}
          textColor={theme.colors.markerAText}
          haloColor={theme.colors.surface}
        />
      ) : null}

      {markerB != null ? (
        <Marker
          label="end"
          ms={markerB}
          offsetX={markerBX}
          color={theme.colors.markerB}
          textColor={theme.colors.markerBText}
          haloColor={theme.colors.surface}
        />
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  // These overlays must not swallow touches meant for the pan gesture. Carried
  // as a style rather than the `pointerEvents` prop, which React Native Web
  // has deprecated.
  noPointerEvents: {
    pointerEvents: 'none',
  },
  // A's line runs from just under its top flag down through the bars; B's runs
  // from the bars down to just above its bottom flag.
  markerLineStart: {
    position: 'absolute',
    left: 0,
    top: HANDLE_HEIGHT,
    bottom: HANDLE_ZONE,
    // The core stays 2px; the edges sit outside it, so the line reads at the
    // same weight it always did.
    width: 2 + MARKER_LINE_HALO * 2,
    marginLeft: -(1 + MARKER_LINE_HALO),
    borderLeftWidth: MARKER_LINE_HALO,
    borderRightWidth: MARKER_LINE_HALO,
    borderRadius: 1,
  },
  markerLineEnd: {
    position: 'absolute',
    left: 0,
    top: HANDLE_ZONE,
    bottom: HANDLE_HEIGHT,
    // The core stays 2px; the edges sit outside it, so the line reads at the
    // same weight it always did.
    width: 2 + MARKER_LINE_HALO * 2,
    marginLeft: -(1 + MARKER_LINE_HALO),
    borderLeftWidth: MARKER_LINE_HALO,
    borderRightWidth: MARKER_LINE_HALO,
    borderRadius: 1,
  },
  markerDotStart: {
    position: 'absolute',
    left: 0,
    top: HANDLE_HEIGHT,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
  },
  markerDotEnd: {
    position: 'absolute',
    left: 0,
    bottom: HANDLE_HEIGHT,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
  },
  markerHandle: {
    position: 'absolute',
    left: 0,
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    marginLeft: -HANDLE_WIDTH / 2,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerHandleStart: {
    top: 0,
  },
  markerHandleEnd: {
    bottom: 0,
  },
  markerHandleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // One pixel wide and scaled to the region's width; see `Region`.
  markerRegion: {
    position: 'absolute',
    left: 0,
    top: HANDLE_ZONE,
    bottom: HANDLE_ZONE,
    width: 1,
    transformOrigin: 'left center',
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
  /** Marker positions in ms — already resolved to their live drag values. */
  markerA?: number;
  markerB?: number;
  /** Whether A and B form a valid region, so the tint band should be drawn. */
  hasRegion: boolean;
}

interface MarkerProps {
  label: 'start' | 'end';
  ms: number;
  durationMs: number;
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
 */
function Marker({
  label,
  ms,
  durationMs,
  color,
  textColor,
  haloColor,
}: MarkerProps) {
  const leftPct = (ms / durationMs) * 100;
  const isStart = label === 'start';

  return (
    <>
      <View
        style={[
          styles.noPointerEvents,
          isStart ? styles.markerLineStart : styles.markerLineEnd,
          {
            left: `${leftPct}%`,
            backgroundColor: color,
            borderColor: haloColor,
          },
        ]}
        accessibilityLabel={`Loop ${label} marker at ${formatDuration(ms)}`}
      />
      <View
        style={[
          styles.noPointerEvents,
          isStart ? styles.markerDotStart : styles.markerDotEnd,
          { left: `${leftPct}%`, backgroundColor: color },
        ]}
      />
      <View
        style={[
          styles.noPointerEvents,
          styles.markerHandle,
          isStart ? styles.markerHandleStart : styles.markerHandleEnd,
          { left: `${leftPct}%`, backgroundColor: color },
        ]}
      >
        <Text style={[styles.markerHandleText, { color: textColor }]}>
          {isStart ? 'A' : 'B'}
        </Text>
      </View>
    </>
  );
}

/**
 * The A/B overlay: the tinted loop region plus each marker's line, dot, and
 * flag. Purely presentational — positions arrive as milliseconds and are
 * turned into percentages of the track, nothing here hit-tests or drags.
 * Absolutely positioned, so it expects a relative parent.
 */
export function WaveformMarkers({
  durationMs,
  markerA,
  markerB,
  hasRegion,
}: WaveformMarkersProps) {
  const { theme } = useTheme();

  if (durationMs <= 0) return null;

  // Derive percentages from ms directly (not from precomputed fractions) so the
  // width is exact — subtracting the fractions drifts by a float ULP.
  const regionLeftPct = hasRegion
    ? ((markerA as number) / durationMs) * 100
    : 0;
  const regionWidthPct = hasRegion
    ? (((markerB as number) - (markerA as number)) / durationMs) * 100
    : 0;

  return (
    <>
      {hasRegion ? (
        <View
          style={[
            styles.noPointerEvents,
            styles.markerRegion,
            {
              left: `${regionLeftPct}%`,
              width: `${regionWidthPct}%`,
              backgroundColor: withAlpha(
                theme.colors.markerA,
                REGION_TINT_ALPHA,
              ),
            },
          ]}
        />
      ) : null}

      {markerA != null ? (
        <Marker
          label="start"
          ms={markerA}
          durationMs={durationMs}
          color={theme.colors.markerA}
          textColor={theme.colors.markerAText}
          haloColor={theme.colors.surface}
        />
      ) : null}

      {markerB != null ? (
        <Marker
          label="end"
          ms={markerB}
          durationMs={durationMs}
          color={theme.colors.markerB}
          textColor={theme.colors.markerBText}
          haloColor={theme.colors.surface}
        />
      ) : null}
    </>
  );
}

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
    top: HANDLE_HEIGHT,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
  },
  markerDotEnd: {
    position: 'absolute',
    bottom: HANDLE_HEIGHT,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
  },
  markerHandle: {
    position: 'absolute',
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
  markerRegion: {
    position: 'absolute',
    top: HANDLE_ZONE,
    bottom: HANDLE_ZONE,
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { withAlpha } from '../utils/color';
import { formatDuration } from '../utils/formatTime';
import { HANDLE_HEIGHT, HANDLE_WIDTH, HANDLE_ZONE } from './waveformLayout';

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
}

/**
 * One marker: a line through the bars, a dot where the line meets them, and a
 * labelled flag. A's flag sits at the top and B's at the bottom, so the two
 * grab targets never stack on top of each other even when the markers are
 * close together.
 */
function Marker({ label, ms, durationMs, color, textColor }: MarkerProps) {
  const leftPct = (ms / durationMs) * 100;
  const isStart = label === 'start';

  return (
    <>
      <View
        style={[
          styles.noPointerEvents,
          isStart ? styles.markerLineStart : styles.markerLineEnd,
          { left: `${leftPct}%`, backgroundColor: color },
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
              backgroundColor: withAlpha(theme.colors.markerA, 0.05),
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
        />
      ) : null}

      {markerB != null ? (
        <Marker
          label="end"
          ms={markerB}
          durationMs={durationMs}
          color={theme.colors.markerB}
          textColor={theme.colors.markerBText}
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
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  markerLineEnd: {
    position: 'absolute',
    top: HANDLE_ZONE,
    bottom: HANDLE_HEIGHT,
    width: 2,
    marginLeft: -1,
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

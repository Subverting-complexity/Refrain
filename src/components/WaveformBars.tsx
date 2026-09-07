import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { WaveformPeaks } from '../types';
import { mix } from '../utils/color';
import { HANDLE_ZONE } from './waveformLayout';

export interface WaveformBarsProps {
  peaks: WaveformPeaks;
  /** Playhead as a 0..1 fraction of the track. */
  progress: number;
  /** Whether a valid A..B region exists — when false the fractions are unused. */
  hasRegion: boolean;
  /** A and B as 0..1 fractions, in the same space as `progress`. */
  aFrac: number;
  bFrac: number;
  /**
   * Whether the loop is armed. With it on the played fill is scoped to A..B:
   * the region before A is never coloured in, because playback is locked
   * between the markers.
   */
  loopActive: boolean;
}

/**
 * A bar's height as a percentage of the band, floored so a silent passage
 * still draws something to click on.
 *
 * `Math.max` passes NaN through, so a bad peak would otherwise reach the style
 * as the string "NaN%". A peak can be NaN: `normalizePeaks` guards the maximum
 * it divides by but not the individual samples, and a 32-bit float WAV can
 * carry a NaN or an infinity straight through decoding. The colour of such a
 * bar is guarded in `mix`; this is the same guard for its other dimension.
 */
function barHeightPct(peak: number): number {
  if (!Number.isFinite(peak)) return 4;
  return Math.max(4, peak * 100);
}

interface BarProps {
  heightPct: number;
  color: string;
}

/**
 * One amplitude bar.
 *
 * Memoised on two primitives, which is the whole point of it being a component
 * at all. The playhead moves ten times a second while a track plays and every
 * frame while a finger is down, but only the one or two bars either side of the
 * fill edge change tier. Without this every bar's style array is rebuilt,
 * flattened and diffed on each of those renders; with it the unchanged ones
 * stop at a two-field comparison.
 *
 * The style array is built here rather than by the caller so the caller never
 * allocates for a bar that is about to bail out.
 */
const Bar = React.memo(function Bar({ heightPct, color }: BarProps) {
  return (
    <View
      style={[styles.bar, { height: `${heightPct}%`, backgroundColor: color }]}
    />
  );
});

/**
 * The amplitude bars. Purely presentational — it is handed positions already in
 * fraction space and only picks each bar's tonal tier from them.
 *
 * The per-bar values that do not depend on the playhead — the height, the bar's
 * centre, and its graded played colour — are computed once per track rather
 * than on every tick. What is left per render is one tier decision per bar.
 */
export const WaveformBars = React.memo(function WaveformBars({
  peaks,
  progress,
  hasRegion,
  aFrac,
  bFrac,
  loopActive,
}: WaveformBarsProps) {
  const { theme } = useTheme();
  // Each tier is an opaque colour the palette states outright, rather than
  // one accent at three alphas over the card. Alpha could not carry this:
  // the alphas were shared by both themes, and against a near-white card a
  // full-strength accent only reaches 5.41, which is not enough room for
  // three steps a reader can tell apart. The palette holds the reasoning
  // and the measured figures; what this does is pick a tier per bar.
  const { waveformDull, waveformLoop, waveformPlayed, waveformPeak } =
    theme.colors;

  // The played tier is a range, not a value: grading it by the bar's own
  // amplitude is what keeps the waveform reading as a waveform rather than a
  // block of colour. The quiet end is the one that has to stay clear of the
  // loop tier below it. Neither the grade nor the height nor the centre
  // depends on the playhead, so all three are resolved once per track.
  const bars = useMemo(
    () =>
      peaks.map((peak, index) => ({
        // A bar's centre fraction, in the SAME 0..1 space as `progress` and
        // the cursor, so the fill edge lands exactly under the playhead.
        center: (index + 0.5) / peaks.length,
        heightPct: barHeightPct(peak),
        playedColor: mix(waveformPlayed, waveformPeak, peak),
      })),
    [peaks, waveformPlayed, waveformPeak],
  );

  return (
    <View style={styles.container}>
      {bars.map((bar, index) => {
        const inRegion =
          hasRegion && bar.center >= aFrac && bar.center <= bFrac;
        const played = loopActive
          ? inRegion && bar.center <= progress
          : bar.center <= progress;

        let color: string;
        if (played) {
          color = bar.playedColor;
        } else if (inRegion) {
          color = waveformLoop;
        } else {
          color = waveformDull;
        }

        return <Bar key={index} heightPct={bar.heightPct} color={color} />;
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  // The bars are inset top and bottom by HANDLE_ZONE so the A flag (top) and
  // B flag (bottom) each have their own band clear of the waveform.
  container: {
    position: 'absolute',
    top: HANDLE_ZONE,
    bottom: HANDLE_ZONE,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bar: {
    flex: 1,
    marginHorizontal: 0.5,
    borderRadius: 2,
    minHeight: 2,
  },
});

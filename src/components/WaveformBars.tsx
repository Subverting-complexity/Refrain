import React from 'react';
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
 * The amplitude bars. Purely presentational — it is handed positions already in
 * fraction space and only picks each bar's tonal tier from them. Memoised
 * because the playhead moves every frame while the peaks never do.
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
  const denom = peaks.length;

  return (
    <View style={styles.container}>
      {peaks.map((peak, index) => {
        // A bar's centre fraction, in the SAME 0..1 space as `progress` and the
        // cursor, so the fill edge lands exactly under the playhead.
        const center = (index + 0.5) / denom;
        const inRegion = hasRegion && center >= aFrac && center <= bFrac;
        const played = loopActive
          ? inRegion && center <= progress
          : center <= progress;

        let backgroundColor: string;
        if (played) {
          // The played tier is a range, not a value: grading it by the bar's
          // own amplitude is what keeps the waveform reading as a waveform
          // rather than a block of colour. The quiet end is the one that has
          // to stay clear of the loop tier below it.
          backgroundColor = mix(waveformPlayed, waveformPeak, peak);
        } else if (inRegion) {
          backgroundColor = waveformLoop;
        } else {
          backgroundColor = waveformDull;
        }

        return (
          <View
            key={index}
            style={[
              styles.bar,
              { height: `${Math.max(4, peak * 100)}%`, backgroundColor },
            ]}
          />
        );
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

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { WaveformPeaks } from '../types';
import { withAlpha } from '../utils/color';
import { HANDLE_ZONE } from './waveformLayout';

// Opacity tiers for the three states a bar can be in. Played bars are bright
// (and graded by amplitude on top of this base); bars inside the A/B region
// that haven't played yet sit at a clearly visible mid tone; everything else
// is dull. Kept as discrete tiers so the loop window reads at a glance.
const PLAYED_BASE_ALPHA = 0.5;
const PLAYED_AMPLITUDE_ALPHA = 0.5;
const LOOP_UNPLAYED_ALPHA = 0.3;
const DULL_ALPHA = 0.12;

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
  // The foreground accent, not the fill accent: these are translucent
  // tints laid over `surface`, and a fill-weight accent washes out badly
  // at low alpha on a light surface.
  //
  // This lifts the played tier against a light surface from 1.66..2.89 to
  // 2.12..5.41 — a range, not a figure, because the tier's alpha is graded
  // by amplitude, so a quiet played bar sits at the bottom of it and only
  // a peak reaches the top. It does *not* rescue the two quiet tiers: the
  // dull tier still sits at 1.18 and the loop-unplayed tier at 1.54, so
  // the loop window is conveyed by a difference too fine to rely on.
  //
  // Fixing that means retuning the alphas, which are shared with dark
  // mode. Dark is better on both readings — its tiers sit at 1.32 and
  // 2.07 against its surface, and its steps between tiers are 1.56 and
  // 1.60 against light's 1.30 and 1.38 — but "better" is not "enough",
  // and the alphas cannot move for one theme alone. See #268.
  const accent = theme.colors.accentForeground;
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
          backgroundColor = withAlpha(
            accent,
            PLAYED_BASE_ALPHA + PLAYED_AMPLITUDE_ALPHA * peak,
          );
        } else if (inRegion) {
          backgroundColor = withAlpha(accent, LOOP_UNPLAYED_ALPHA);
        } else {
          backgroundColor = withAlpha(accent, DULL_ALPHA);
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

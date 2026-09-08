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
 * How many bars share one memoised group.
 *
 * The bars are drawn in groups because an edge that moves re-renders whatever
 * it lands in, and the whole surface is far too large a unit for that: a
 * playhead tick or a pointer event moves one edge past a bar or two, and
 * before grouping that rebuilt and re-reconciled all two hundred children.
 *
 * What a render now costs is the number of groups plus the size of one, which
 * is smallest when the two are about equal — the square root of the bar count,
 * near enough fourteen for the two hundred buckets the analyser produces. Ten
 * is within a bar of that and divides those two hundred evenly, so the default
 * track draws twenty groups of ten rather than a short group on the end.
 */
const BARS_PER_GROUP = 10;

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

/** Everything about one bar that does not depend on where the edges are. */
interface BarSpec {
  /**
   * The bar's centre fraction, in the SAME 0..1 space as `progress` and the
   * cursor, so the fill edge lands exactly under the playhead.
   */
  center: number;
  heightPct: number;
  playedColor: string;
}

interface BarProps {
  heightPct: number;
  color: string;
}

/**
 * One amplitude bar.
 *
 * Memoised on two primitives, which is the whole point of it being a component
 * at all. Within a group that does re-render, only the one or two bars either
 * side of an edge change tier; without this every bar in that group would have
 * its style array rebuilt, flattened and diffed, and with it the unchanged ones
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

interface BarGroupProps {
  /** A stable slice of the track's bars — rebuilt only when the track is. */
  bars: BarSpec[];
  /**
   * The three tier edges, as indices into *this group's* bars and already
   * clamped to it: an edge below the group arrives as 0 and one above it as
   * the group's length. That clamp is what makes the memo work. The edges move
   * continuously, but a group they are nowhere near is handed the same three
   * numbers on every render and stops at the comparison, so a drag re-renders
   * the ten bars under the finger instead of the whole surface.
   *
   * Clamping cannot change what is drawn: every bar in the group sits strictly
   * inside its span, so an edge outside the span already included all of them
   * or none, which is exactly what the clamped index says.
   */
  playedEnd: number;
  regionStart: number;
  regionEnd: number;
  hasRegion: boolean;
  loopActive: boolean;
  loopColor: string;
  dullColor: string;
}

/** One run of bars, memoised so an edge elsewhere on the track cannot reach it. */
const BarGroup = React.memo(function BarGroup({
  bars,
  playedEnd,
  regionStart,
  regionEnd,
  hasRegion,
  loopActive,
  loopColor,
  dullColor,
}: BarGroupProps) {
  return (
    <View style={[styles.group, { flexGrow: bars.length }]}>
      {bars.map((bar, index) => {
        const inRegion = hasRegion && index >= regionStart && index < regionEnd;
        const played = loopActive
          ? inRegion && index < playedEnd
          : index < playedEnd;

        let color: string;
        if (played) {
          color = bar.playedColor;
        } else if (inRegion) {
          color = loopColor;
        } else {
          color = dullColor;
        }

        return <Bar key={index} heightPct={bar.heightPct} color={color} />;
      })}
    </View>
  );
});

/**
 * How many leading bars satisfy `predicate`.
 *
 * Every tier boundary is a comparison of a bar's centre against one position,
 * and the centres ascend, so each boundary is a prefix of the bars and a scan
 * finds where it falls. The scan compares the bars' own centre values, so the
 * index it returns selects exactly the bars a per-bar comparison would have —
 * including where a centre sits exactly on an edge, which a formula derived
 * from the fraction could round the other way.
 */
function prefixCount(
  bars: BarSpec[],
  predicate: (bar: BarSpec) => boolean,
): number {
  let count = 0;
  while (count < bars.length && predicate(bars[count])) count += 1;
  return count;
}

/**
 * The amplitude bars. Purely presentational — it is handed positions already in
 * fraction space and only picks each bar's tonal tier from them.
 *
 * The per-bar values that do not depend on the playhead — the height, the bar's
 * centre, and its graded played colour — are computed once per track rather
 * than on every tick. What is left per render is finding the three edges, which
 * is a numeric scan, and handing each group its own clamped view of them.
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
  const bars = useMemo<BarSpec[]>(
    () =>
      peaks.map((peak, index) => ({
        center: (index + 0.5) / peaks.length,
        heightPct: barHeightPct(peak),
        playedColor: mix(waveformPlayed, waveformPeak, peak),
      })),
    [peaks, waveformPlayed, waveformPeak],
  );

  // The slices are cut once per track so a group is handed the identical array
  // on every render; a fresh slice would defeat its memo on the first prop it
  // compares.
  const groups = useMemo(() => {
    const out: { offset: number; bars: BarSpec[] }[] = [];
    for (let offset = 0; offset < bars.length; offset += BARS_PER_GROUP) {
      out.push({ offset, bars: bars.slice(offset, offset + BARS_PER_GROUP) });
    }
    return out;
  }, [bars]);

  // Where the three tier edges fall, as bar indices. The region runs from the
  // first bar centred at or after A to the last centred at or before B, and
  // the played run ends at the last bar centred at or before the playhead.
  const playedEnd = prefixCount(bars, (bar) => bar.center <= progress);
  const regionStart = hasRegion
    ? prefixCount(bars, (bar) => bar.center < aFrac)
    : 0;
  const regionEnd = hasRegion
    ? prefixCount(bars, (bar) => bar.center <= bFrac)
    : 0;

  return (
    <View style={styles.container}>
      {groups.map((group) => {
        const size = group.bars.length;
        const local = (index: number): number =>
          Math.max(0, Math.min(size, index - group.offset));
        return (
          <BarGroup
            key={group.offset}
            bars={group.bars}
            playedEnd={local(playedEnd)}
            regionStart={local(regionStart)}
            regionEnd={local(regionEnd)}
            hasRegion={hasRegion}
            loopActive={loopActive}
            loopColor={waveformLoop}
            dullColor={waveformDull}
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
  // A group takes a share of the width proportional to how many bars it holds
  // (`flexGrow` is set per group), which is what keeps every bar the same width
  // whether or not the bar count divides evenly. `alignSelf: stretch` gives it
  // the band's full height, so a bar's percentage height still resolves against
  // the band exactly as it did when the bars were direct children.
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    flexBasis: 0,
    flexShrink: 1,
  },
  bar: {
    flex: 1,
    marginHorizontal: 0.5,
    borderRadius: 2,
    minHeight: 2,
  },
});

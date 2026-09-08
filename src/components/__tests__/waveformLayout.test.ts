import {
  barCountForTrackWidth,
  DEFAULT_WAVEFORM_HEIGHT,
  downsamplePeaks,
  HORIZONTAL_PADDING,
  MIN_BAR_COUNT,
  MIN_BAR_PITCH,
  positionFromTouchX,
  snapDownToBarGrid,
  snapUpToBarGrid,
  trackOffsetPx,
  waveformHeightForViewport,
} from '../waveformLayout';

describe('waveformHeightForViewport', () => {
  it('scales the surface to the viewport', () => {
    expect(waveformHeightForViewport(1000)).toBe(280);
  });

  it('never goes below the floor on a short viewport', () => {
    expect(waveformHeightForViewport(400)).toBe(DEFAULT_WAVEFORM_HEIGHT);
  });

  it('stops growing on a tall one', () => {
    expect(waveformHeightForViewport(4000)).toBe(340);
  });

  /**
   * The reason this is clamped and rounded rather than raw. Android reports a
   * metric change for every inset and soft-keyboard event, and the component
   * that reads the viewport only absorbs them if nearly all of them come back
   * as the height already in use.
   */
  it('returns the same height either side of a small metric change', () => {
    expect(waveformHeightForViewport(900)).toBe(waveformHeightForViewport(901));
  });
});

/**
 * The snaps exist to stop the bars re-rendering for a movement that cannot
 * change one, so what has to be proved about them is that they change nothing
 * on screen. `WaveformBars` decides a bar's tier by comparing its centre —
 * `(i + 0.5) / n` — against a position, so the property is that the snapped
 * position admits exactly the bars the raw one did, for every position and
 * every bar count.
 */
describe('bar-grid snapping', () => {
  const BAR_COUNTS = [1, 2, 3, 5, 7, 16, 200];

  /** Every centre, plus points either side of each, plus the ends. */
  function probePositions(barCount: number): number[] {
    const out = [-0.4, 0, 1, 1.4];
    for (let i = 0; i < barCount; i += 1) {
      const centre = (i + 0.5) / barCount;
      out.push(centre, centre - 0.4 / barCount, centre + 0.4 / barCount);
    }
    return out;
  }

  const centres = (barCount: number): number[] =>
    Array.from({ length: barCount }, (_, i) => (i + 0.5) / barCount);

  /** Which bars a threshold admits, as one comparable value per position. */
  function admitted(
    barCount: number,
    threshold: number,
    test: (centre: number, threshold: number) => boolean,
  ): string {
    return centres(barCount)
      .map((centre) => (test(centre, threshold) ? '1' : '0'))
      .join('');
  }

  const atOrBefore = (centre: number, threshold: number): boolean =>
    centre <= threshold;
  const atOrAfter = (centre: number, threshold: number): boolean =>
    centre >= threshold;

  it.each(BAR_COUNTS)(
    'snapping down admits the same bars at or before the position (%i bars)',
    (barCount) => {
      for (const position of probePositions(barCount)) {
        const snapped = snapDownToBarGrid(position, barCount);
        expect(admitted(barCount, snapped, atOrBefore)).toBe(
          admitted(barCount, position, atOrBefore),
        );
      }
    },
  );

  it.each(BAR_COUNTS)(
    'snapping up admits the same bars at or after the position (%i bars)',
    (barCount) => {
      for (const position of probePositions(barCount)) {
        const snapped = snapUpToBarGrid(position, barCount);
        expect(admitted(barCount, snapped, atOrAfter)).toBe(
          admitted(barCount, position, atOrAfter),
        );
      }
    },
  );

  /**
   * The point of the whole exercise: a playhead that advances a fraction of a
   * bar, or a marker nudged a pixel, has to come back as the value already in
   * use or the memoised component below it re-renders anyway.
   */
  it('returns one value for every position between two bar centres', () => {
    const barCount = 200;
    const between = [0.503, 0.505, 0.5065, 0.5074];
    const snapped = between.map((p) => snapDownToBarGrid(p, barCount));
    expect(new Set(snapped).size).toBe(1);
    expect(new Set(between.map((p) => snapUpToBarGrid(p, barCount))).size).toBe(
      1,
    );
  });

  it('clamps a position past either end to a single value', () => {
    expect(snapDownToBarGrid(2, 200)).toBe(snapDownToBarGrid(50, 200));
    expect(snapDownToBarGrid(-1, 200)).toBe(snapDownToBarGrid(-9, 200));
    expect(snapUpToBarGrid(2, 200)).toBe(snapUpToBarGrid(50, 200));
    expect(snapUpToBarGrid(-1, 200)).toBe(snapUpToBarGrid(-9, 200));
  });

  /**
   * The correction the snaps make after their first guess. Deriving the index
   * from `fraction * barCount` and comparing a centre built as `(index + 0.5)
   * / barCount` are different arithmetic, and at a position on or beside a
   * centre they round opposite ways — so the guess can be a bar out in either
   * direction. These are positions where it is, found by sweeping the bar
   * counts the analyser can produce; without the correction each of them puts
   * one bar in the wrong tier.
   */
  it.each([
    [3, 0.16666666666666669],
    [11, 7.5 / 11],
    [13, 0.7307692307692308],
    [19, 0.5526315789473685],
    [21, 0.6428571428571429],
    [25, 0.58],
  ])(
    'corrects a first guess that lands a bar out (%i bars, %f)',
    (barCount, position) => {
      expect(
        admitted(barCount, snapDownToBarGrid(position, barCount), atOrBefore),
      ).toBe(admitted(barCount, position, atOrBefore));
      expect(
        admitted(barCount, snapUpToBarGrid(position, barCount), atOrAfter),
      ).toBe(admitted(barCount, position, atOrAfter));
    },
  );

  it('passes through when there are no bars to snap to', () => {
    expect(snapDownToBarGrid(0.42, 0)).toBe(0.42);
    expect(snapUpToBarGrid(0.42, 0)).toBe(0.42);
    expect(snapDownToBarGrid(NaN, 200)).toBeNaN();
    expect(snapUpToBarGrid(NaN, 200)).toBeNaN();
  });
});

/**
 * The analyser produces two hundred buckets, which is the right resolution to
 * keep and more than a phone can draw: on a 280dp track that is 1.4dp a bar,
 * of which 1dp is the gap, leaving a bar thinner than a physical pixel. These
 * two decide how many of those buckets actually become views.
 */
describe('barCountForTrackWidth', () => {
  it('fits as many bars as the track has room for', () => {
    // 300dp at 3dp a bar.
    expect(barCountForTrackWidth(300, 200)).toBe(100);
  });

  it('never asks for more bars than the analyser produced', () => {
    expect(barCountForTrackWidth(3000, 200)).toBe(200);
  });

  it('keeps a floor so a narrow surface still reads as a waveform', () => {
    expect(barCountForTrackWidth(30, 200)).toBe(MIN_BAR_COUNT);
  });

  it('does not invent bars the analyser never produced to meet the floor', () => {
    expect(barCountForTrackWidth(30, 8)).toBe(8);
  });

  it('draws everything it has before the surface is measured', () => {
    // A first frame with no bars would flash empty; the measurement lands a
    // frame later and the count settles then.
    expect(barCountForTrackWidth(0, 200)).toBe(200);
    expect(barCountForTrackWidth(Number.NaN, 200)).toBe(200);
  });

  it('draws nothing when there are no peaks', () => {
    expect(barCountForTrackWidth(300, 0)).toBe(0);
  });

  it('leaves room for the gap either side of every bar', () => {
    const width = 300;
    const count = barCountForTrackWidth(width, 200);
    expect(width / count).toBeGreaterThanOrEqual(MIN_BAR_PITCH);
  });
});

describe('downsamplePeaks', () => {
  it('returns the peaks unchanged when they already fit', () => {
    const peaks = [0.1, 0.2, 0.3];
    // The same array, not an equal one: the memo above this holds on identity.
    expect(downsamplePeaks(peaks, 3)).toBe(peaks);
    expect(downsamplePeaks(peaks, 8)).toBe(peaks);
  });

  it('takes the loudest sample of each run', () => {
    // The maximum rather than the mean: averaging a transient with the silence
    // either side of it flattens what the waveform is read for.
    expect(downsamplePeaks([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3]);
  });

  it('covers every source sample exactly once', () => {
    const peaks = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    const out = downsamplePeaks(peaks, 3);

    expect(out).toHaveLength(3);
    // Nothing dropped, so the loudest sample of the whole track survives.
    expect(Math.max(...out)).toBe(0.7);
  });

  it('ignores a sample that is not a number', () => {
    // A 32-bit float WAV can carry a NaN straight through decoding, and one
    // would otherwise win every comparison in the run it sits in.
    expect(downsamplePeaks([0.4, Number.NaN, 0.1, 0.2], 2)).toEqual([0.4, 0.2]);
  });

  it('returns nothing for a count of zero', () => {
    expect(downsamplePeaks([0.1, 0.2], 0)).toEqual([]);
  });
});

describe('positionFromTouchX', () => {
  // A 276px track, ten seconds long, inset by the surface padding.
  const TRACK = 276;
  const DURATION = 10000;

  it('maps the left edge of the bars to the start of the track', () => {
    expect(positionFromTouchX(HORIZONTAL_PADDING, TRACK, DURATION)).toBe(0);
  });

  it('maps the right edge of the bars to the end of the track', () => {
    expect(
      positionFromTouchX(HORIZONTAL_PADDING + TRACK, TRACK, DURATION),
    ).toBe(DURATION);
  });

  it('maps the middle of the bars to the middle of the track', () => {
    expect(
      positionFromTouchX(HORIZONTAL_PADDING + TRACK / 2, TRACK, DURATION),
    ).toBe(DURATION / 2);
  });

  it('clamps a touch that lands in the padding', () => {
    expect(positionFromTouchX(0, TRACK, DURATION)).toBe(0);
    expect(positionFromTouchX(400, TRACK, DURATION)).toBe(DURATION);
  });

  it('reports nothing before the surface is measured', () => {
    expect(positionFromTouchX(50, 0, DURATION)).toBeNull();
  });

  it('reports nothing for a track of unknown length', () => {
    expect(positionFromTouchX(50, TRACK, 0)).toBeNull();
  });
});

describe('trackOffsetPx', () => {
  it('places a position proportionally along the track', () => {
    expect(trackOffsetPx(0, 10000, 276)).toBe(0);
    expect(trackOffsetPx(5000, 10000, 276)).toBe(138);
    expect(trackOffsetPx(10000, 10000, 276)).toBe(276);
  });

  it('keeps a position outside the track on it', () => {
    expect(trackOffsetPx(-500, 10000, 276)).toBe(0);
    expect(trackOffsetPx(20000, 10000, 276)).toBe(276);
  });

  it('parks at the start for a track of unknown length', () => {
    expect(trackOffsetPx(5000, 0, 276)).toBe(0);
  });

  it('parks at the start before the surface is measured', () => {
    expect(trackOffsetPx(5000, 10000, 0)).toBe(0);
  });
});

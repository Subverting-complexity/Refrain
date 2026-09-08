import {
  DEFAULT_WAVEFORM_HEIGHT,
  snapDownToBarGrid,
  snapUpToBarGrid,
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

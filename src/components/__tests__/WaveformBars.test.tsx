import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { darkTheme } from '../../theme';
import { mix } from '../../utils/color';
import { WaveformBars } from '../WaveformBars';

jest.mock('../../hooks/useTheme');

// Five bars, so the centres land at 0.1, 0.3, 0.5, 0.7 and 0.9 and a progress
// value can be placed either side of a single one of them.
const PEAKS = [0.2, 0.5, 0.8, 1.0, 0.6];

function findBars(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.type === 'View' &&
      node.props.style &&
      Array.isArray(node.props.style) &&
      node.props.style.some(
        (s: Record<string, unknown>) => s && typeof s.height === 'string',
      ),
  );
}

function render(
  props: Partial<React.ComponentProps<typeof WaveformBars>> = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <WaveformBars
        peaks={PEAKS}
        progress={0}
        hasRegion={false}
        aFrac={0}
        bFrac={0}
        loopActive={false}
        {...props}
      />,
    );
  });
  return tree;
}

function update(
  tree: ReactTestRenderer,
  props: Partial<React.ComponentProps<typeof WaveformBars>> = {},
) {
  act(() => {
    tree.update(
      <WaveformBars
        peaks={PEAKS}
        progress={0}
        hasRegion={false}
        aFrac={0}
        bFrac={0}
        loopActive={false}
        {...props}
      />,
    );
  });
}

const fill = (bar: ReturnType<typeof findBars>[number]): string => {
  const styled = bar.props.style.find(
    (s: Record<string, unknown>) => typeof s?.backgroundColor === 'string',
  ) as { backgroundColor: string } | undefined;
  return styled?.backgroundColor ?? '';
};

describe('WaveformBars', () => {
  it('renders one bar per peak', () => {
    expect(findBars(render())).toHaveLength(PEAKS.length);
  });

  /**
   * The reason the bars are memoised. A playhead tick moves the fill edge past
   * at most a bar or two; every other bar's style array must survive untouched,
   * because rebuilding, flattening and diffing 200 of them ten times a second
   * is the cost this is here to remove.
   *
   * Reference equality is the assertion that can see it: React reuses the
   * previous element for a memoised child that bailed out, so an unchanged
   * bar's props object is the identical object, not an equal one.
   */
  it('leaves a bar untouched when the playhead moves past a different bar', () => {
    // 0.2 has already passed the bar centred at 0.1; 0.4 additionally passes
    // the one at 0.3. The bars at 0.5, 0.7 and 0.9 are unaffected by either.
    const tree = render({ progress: 0.2 });
    const before = findBars(tree).map((bar) => bar.props.style);

    update(tree, { progress: 0.4 });
    const after = findBars(tree).map((bar) => bar.props.style);

    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
    expect(after[4]).toBe(before[4]);
  });

  it('keeps the grading of a played bar across a tick that does not reach it', () => {
    const tree = render({ progress: 1 });
    const graded = findBars(tree).map(fill);

    update(tree, { progress: 1 });

    expect(findBars(tree).map(fill)).toEqual(graded);
    // Grading is per bar, so two bars of different amplitude must not match.
    expect(graded[0]).not.toBe(graded[3]);
    expect(graded[3]).toBe(darkTheme.colors.waveformPeak);
  });

  it('scopes the played fill to the region when the loop is armed', () => {
    // Region 0.2..0.8 with the playhead at 0.6: the bar at 0.1 sits before A
    // and stays dull even though the playhead is past it.
    const tree = render({
      progress: 0.6,
      hasRegion: true,
      aFrac: 0.2,
      bFrac: 0.8,
      loopActive: true,
    });
    const bars = findBars(tree);

    expect(fill(bars[0])).toBe(darkTheme.colors.waveformDull);
    expect(fill(bars[3])).toBe(darkTheme.colors.waveformLoop);
    expect(fill(bars[4])).toBe(darkTheme.colors.waveformDull);
  });
});

/**
 * The bars are drawn in memoised groups so that a moving edge re-renders the
 * ten bars around it rather than all two hundred. Grouping is an optimisation
 * and nothing else, so what has to be proved about it is that it draws the
 * same picture the flat per-bar rules did, and that it actually confines a
 * re-render to the group the edge is in.
 */
describe('WaveformBars grouping', () => {
  // Enough bars for several groups, with amplitudes that vary so a played
  // bar's grading is distinguishable from its neighbour's.
  const MANY = Array.from({ length: 50 }, (_, i) => ((i % 9) + 1) / 9);

  /** The tier rules, stated flatly, as the reference to compare against. */
  function expectedFills(
    peaks: number[],
    props: {
      progress: number;
      hasRegion: boolean;
      aFrac: number;
      bFrac: number;
      loopActive: boolean;
    },
  ): string[] {
    const { progress, hasRegion, aFrac, bFrac, loopActive } = props;
    return peaks.map((peak, index) => {
      const centre = (index + 0.5) / peaks.length;
      const inRegion = hasRegion && centre >= aFrac && centre <= bFrac;
      const played = loopActive
        ? inRegion && centre <= progress
        : centre <= progress;
      if (played) {
        return mix(
          darkTheme.colors.waveformPlayed,
          darkTheme.colors.waveformPeak,
          peak,
        );
      }
      return inRegion
        ? darkTheme.colors.waveformLoop
        : darkTheme.colors.waveformDull;
    });
  }

  function renderMany(props: {
    progress: number;
    hasRegion: boolean;
    aFrac: number;
    bFrac: number;
    loopActive: boolean;
  }) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<WaveformBars peaks={MANY} {...props} />);
    });
    return tree;
  }

  const CASES = [
    { progress: 0, hasRegion: false, aFrac: 0, bFrac: 0, loopActive: false },
    { progress: 1, hasRegion: false, aFrac: 0, bFrac: 0, loopActive: false },
    { progress: 0.37, hasRegion: false, aFrac: 0, bFrac: 0, loopActive: false },
    // An edge landing exactly on a bar centre, where a boundary derived by
    // arithmetic rather than by comparison could fall the wrong way.
    { progress: 0.25, hasRegion: false, aFrac: 0, bFrac: 0, loopActive: false },
    {
      progress: 0.6,
      hasRegion: true,
      aFrac: 0.2,
      bFrac: 0.8,
      loopActive: true,
    },
    {
      progress: 0.6,
      hasRegion: true,
      aFrac: 0.2,
      bFrac: 0.8,
      loopActive: false,
    },
    // The region edges on centres, and the playhead outside the region.
    {
      progress: 0.9,
      hasRegion: true,
      aFrac: 0.25,
      bFrac: 0.75,
      loopActive: true,
    },
    // A region narrower than one bar.
    {
      progress: 0.5,
      hasRegion: true,
      aFrac: 0.5,
      bFrac: 0.505,
      loopActive: true,
    },
  ];

  it.each(CASES)('draws the flat per-bar rules (%j)', (props) => {
    expect(findBars(renderMany(props)).map(fill)).toEqual(
      expectedFills(MANY, props),
    );
  });

  /** The group containers: the only Views carrying a numeric `flexGrow`. */
  function findGroups(tree: ReactTestRenderer) {
    return tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (style: Record<string, unknown>) =>
            style && typeof style.flexGrow === 'number',
        ),
    );
  }

  /**
   * The property the grouping exists for. Moving the playhead past one bar
   * must re-render the group that bar is in and no other — reference equality
   * is the assertion that can see it, because React reuses the previous
   * element for a memoised child that bailed out.
   *
   * Without this, every one of the two hundred bars on a real track was
   * rebuilt and re-reconciled ten times a second while playing, and on every
   * pointer event of a drag.
   */
  it('re-renders only the group the edge moved through', () => {
    // Fifty bars, so centres sit 0.02 apart at 0.01, 0.03, 0.05 ... The bar
    // centred at 0.51 is index 25, in the third group of ten; 0.505 sits just
    // before it and 0.515 just past it.
    const tree = renderMany({
      progress: 0.505,
      hasRegion: false,
      aFrac: 0,
      bFrac: 0,
      loopActive: false,
    });
    const groupsBefore = findGroups(tree).map((group) => group.props.style);
    const barsBefore = findBars(tree).map((bar) => bar.props.style);

    act(() => {
      tree.update(
        <WaveformBars
          peaks={MANY}
          progress={0.515}
          hasRegion={false}
          aFrac={0}
          bFrac={0}
          loopActive={false}
        />,
      );
    });
    const groupsAfter = findGroups(tree).map((group) => group.props.style);
    const barsAfter = findBars(tree).map((bar) => bar.props.style);

    // The crossed bar, and the group holding it, are the only things rebuilt.
    expect(barsAfter[25]).not.toBe(barsBefore[25]);
    expect(groupsAfter[2]).not.toBe(groupsBefore[2]);
    for (const group of [0, 1, 3, 4]) {
      expect(groupsAfter[group]).toBe(groupsBefore[group]);
    }
    for (const bar of [0, 9, 24, 26, 30, 49]) {
      expect(barsAfter[bar]).toBe(barsBefore[bar]);
    }
  });

  it('keeps every bar the same width when the count does not divide evenly', () => {
    // 23 bars is two full groups and a short one; the short group must take a
    // proportional share of the width, not an equal one, or its bars would
    // come out wider than the rest.
    const peaks = Array.from({ length: 23 }, () => 0.5);
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <WaveformBars
          peaks={peaks}
          progress={0}
          hasRegion={false}
          aFrac={0}
          bFrac={0}
          loopActive={false}
        />,
      );
    });
    const groups = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (style: Record<string, unknown>) =>
            style && typeof style.flexGrow === 'number',
        ),
    );
    const grow = groups.map(
      (group) =>
        group.props.style.find(
          (style: Record<string, unknown>) =>
            style && typeof style.flexGrow === 'number',
        ).flexGrow,
    );
    expect(grow).toEqual([10, 10, 3]);
    expect(findBars(tree)).toHaveLength(23);
  });
});

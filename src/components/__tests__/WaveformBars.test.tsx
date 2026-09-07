import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { darkTheme } from '../../theme';
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

import React from 'react';
import {
  act,
  create,
  ReactTestRenderer,
  ReactTestInstance,
} from 'react-test-renderer';

import { darkTheme } from '../../theme';
import { ToggleSwitch } from '../ToggleSwitch';

jest.mock('../../hooks/useTheme');

// ToggleSwitch starts a 160ms Animated.timing on mount. Fake timers keep its
// frames off the real event loop, and the afterEach below unmounts and
// flushes so no timer survives the suite — otherwise a late frame fires after
// Jest tears down the environment and crashes the worker.
let trees: ReactTestRenderer[] = [];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => {
    trees.forEach((tree) => tree.unmount());
  });
  trees = [];
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

function render(
  value: boolean,
  onValueChange: jest.Mock,
  label = 'Test toggle',
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ToggleSwitch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
      />,
    );
  });
  trees.push(tree);
  return tree;
}

function getSwitch(tree: ReactTestRenderer) {
  return tree.root.find((node) => node.props.accessibilityRole === 'switch');
}

/** The pill itself: the switch's only child that carries a border width. */
function getTrack(tree: ReactTestRenderer): ReactTestInstance {
  return getSwitch(tree).find(
    (node) =>
      flatten(node.props.style).borderWidth !== undefined &&
      node.props.accessibilityRole !== 'switch',
  );
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, entry) => ({ ...acc, ...flatten(entry) }),
      {},
    );
  }
  return (style ?? {}) as Record<string, unknown>;
}

describe('ToggleSwitch', () => {
  it('reflects the on state in the switch accessibility props', () => {
    const tree = render(true, jest.fn(), 'Count-in on');
    const toggle = getSwitch(tree);

    expect(toggle.props.accessibilityState).toEqual({ checked: true });
    expect(toggle.props.accessibilityLabel).toBe('Count-in on');
  });

  it('reflects the off state in the switch accessibility props', () => {
    const tree = render(false, jest.fn(), 'Count-in off');
    const toggle = getSwitch(tree);

    expect(toggle.props.accessibilityState).toEqual({ checked: false });
    expect(toggle.props.accessibilityLabel).toBe('Count-in off');
  });

  it('emits the negated value when pressed while on', () => {
    const onValueChange = jest.fn();
    const tree = render(true, onValueChange);

    act(() => getSwitch(tree).props.onPress());

    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('emits the negated value when pressed while off', () => {
    const onValueChange = jest.fn();
    const tree = render(false, onValueChange);

    act(() => getSwitch(tree).props.onPress());

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  // Neither fill reaches 3:1 against what the switch sits on: the off track
  // is deliberately close to its surroundings so the knob stays legible on
  // it, and light mode's accent is a fill colour at 2.30 against the page.
  // The ring is what identifies the control in both states, so it has to be
  // there in both — a ring that came and went with the value would leave one
  // state with no boundary at all.
  it.each([
    ['on', true],
    ['off', false],
  ])('rings the pill with the outline colour while %s', (_label, value) => {
    const track = flatten(getTrack(render(value, jest.fn())).props.style);

    expect(track.borderWidth).toBe(1);
    expect(track.borderColor).toBe(darkTheme.colors.outline);
  });
});

import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { ToggleSwitch } from '../ToggleSwitch';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        accentText: '#0a1612',
        textSecondary: '#8fa89e',
        border: '#2d4a40',
      },
    },
  }),
}));

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
});

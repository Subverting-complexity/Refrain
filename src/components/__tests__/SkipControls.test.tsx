import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SkipControls } from '../SkipControls';
import { SKIP_PRESETS } from '../../hooks/useSkipInterval';

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      dark: true,
      colors: {
        accent: '#7edbb8',
        accentText: '#0a1612',
        textPrimary: '#e8f5f0',
        border: '#2d4a40',
      },
      typography: { bodySmall: {} },
    },
  }),
}));

function renderControls(
  props: Partial<React.ComponentProps<typeof SkipControls>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SkipControls
        skipSeconds={5}
        onSkipSecondsChange={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

function findChip(tree: ReactTestRenderer, seconds: number) {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === `Skip amount ${seconds}s` &&
      typeof node.props.onPress === 'function',
  );
  return nodes[nodes.length - 1];
}

describe('SkipControls', () => {
  it('renders the Skip label', () => {
    const tree = renderControls();
    expect(JSON.stringify(tree.toJSON())).toContain('Skip');
  });

  it('renders one chip per skip preset with interval labels', () => {
    const tree = renderControls();
    for (const seconds of SKIP_PRESETS) {
      const chip = findChip(tree, seconds);
      expect(chip).toBeDefined();
      expect(chip.props.accessibilityRole).toBe('radio');
    }
  });

  it('marks the chip matching skipSeconds as selected', () => {
    const tree = renderControls({ skipSeconds: 10 });
    expect(findChip(tree, 10).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(findChip(tree, 5).props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('calls onSkipSecondsChange with the pressed interval', () => {
    const onSkipSecondsChange = jest.fn();
    const tree = renderControls({ onSkipSecondsChange });
    act(() => findChip(tree, 30).props.onPress());
    expect(onSkipSecondsChange).toHaveBeenCalledTimes(1);
    expect(onSkipSecondsChange).toHaveBeenCalledWith(30);
  });
});

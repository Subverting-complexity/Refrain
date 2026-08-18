import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SkipControls } from '../SkipControls';
import { formatSkipLabel, SKIP_PRESETS } from '../../hooks/useSkipInterval';

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
        preference={{ mode: 'interval', seconds: 5 }}
        onPreferenceChange={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

function findChip(tree: ReactTestRenderer, label: string) {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === `Skip amount ${label}` &&
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
      const chip = findChip(tree, formatSkipLabel(seconds));
      expect(chip).toBeDefined();
      expect(chip.props.accessibilityRole).toBe('radio');
    }
  });

  it('renders minute presets in minutes', () => {
    const tree = renderControls();
    expect(findChip(tree, '1m')).toBeDefined();
    expect(findChip(tree, '5m')).toBeDefined();
  });

  it('renders a Full chip alongside the intervals', () => {
    const tree = renderControls();
    expect(findChip(tree, 'Full')).toBeDefined();
  });

  it('marks the chip matching the configured interval as selected', () => {
    const tree = renderControls({
      preference: { mode: 'interval', seconds: 10 },
    });
    expect(findChip(tree, '10s').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(findChip(tree, '5s').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('marks Full as selected in full mode, and no interval with it', () => {
    const tree = renderControls({ preference: { mode: 'full', seconds: 10 } });
    expect(findChip(tree, 'Full').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(findChip(tree, '10s').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('calls onPreferenceChange with the pressed interval', () => {
    const onPreferenceChange = jest.fn();
    const tree = renderControls({ onPreferenceChange });
    act(() => findChip(tree, '30s').props.onPress());
    expect(onPreferenceChange).toHaveBeenCalledTimes(1);
    expect(onPreferenceChange).toHaveBeenCalledWith({
      mode: 'interval',
      seconds: 30,
    });
  });

  it('calls onPreferenceChange with full mode when Full is pressed', () => {
    const onPreferenceChange = jest.fn();
    const tree = renderControls({ onPreferenceChange });
    act(() => findChip(tree, 'Full').props.onPress());
    expect(onPreferenceChange).toHaveBeenCalledWith({
      mode: 'full',
      seconds: 5,
    });
  });

  // Switching to Full and back must not lose the amount the user had picked.
  it('carries the stored amount through a switch to Full', () => {
    const onPreferenceChange = jest.fn();
    const tree = renderControls({
      preference: { mode: 'interval', seconds: 300 },
      onPreferenceChange,
    });
    act(() => findChip(tree, 'Full').props.onPress());
    expect(onPreferenceChange).toHaveBeenCalledWith({
      mode: 'full',
      seconds: 300,
    });
  });
});

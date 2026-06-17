import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { TransportControls } from '../TransportControls';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        accentText: '#111d1f',
        border: '#2a4a4e',
        surface: '#1a2e30',
        textPrimary: '#e0f0eb',
        textSecondary: '#8ba89e',
      },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
      typography: {},
    },
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

function renderControls(
  props: Partial<React.ComponentProps<typeof TransportControls>> = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <TransportControls
        status="paused"
        onPlay={jest.fn()}
        onPause={jest.fn()}
        onStop={jest.fn()}
        onSkipBack={jest.fn()}
        onSkipForward={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

function pressByLabel(tree: ReactTestRenderer, label: string) {
  const button = tree.root.find(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  act(() => {
    button.props.onPress();
  });
}

describe('TransportControls', () => {
  it('renders stop, skip, and play/pause controls', () => {
    const tree = renderControls();
    for (const label of ['Stop', 'Skip back', 'Skip forward', 'Play']) {
      expect(
        tree.root.findAll((n) => n.props.accessibilityLabel === label).length,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('calls onSkipBack and onSkipForward', () => {
    const onSkipBack = jest.fn();
    const onSkipForward = jest.fn();
    const tree = renderControls({ onSkipBack, onSkipForward });

    pressByLabel(tree, 'Skip back');
    pressByLabel(tree, 'Skip forward');

    expect(onSkipBack).toHaveBeenCalledTimes(1);
    expect(onSkipForward).toHaveBeenCalledTimes(1);
  });

  it('shows Play when paused and calls onPlay', () => {
    const onPlay = jest.fn();
    const tree = renderControls({ status: 'paused', onPlay });
    pressByLabel(tree, 'Play');
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('shows Pause when playing and calls onPause', () => {
    const onPause = jest.fn();
    const tree = renderControls({ status: 'playing', onPause });
    pressByLabel(tree, 'Pause');
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('calls onStop', () => {
    const onStop = jest.fn();
    const tree = renderControls({ onStop });
    pressByLabel(tree, 'Stop');
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('disables controls when idle', () => {
    const tree = renderControls({ status: 'idle' });
    const skipBack = tree.root.find(
      (n) => n.props.accessibilityLabel === 'Skip back',
    );
    expect(skipBack.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });
});

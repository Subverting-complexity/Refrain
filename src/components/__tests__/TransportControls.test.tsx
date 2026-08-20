import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { TransportControls } from '../TransportControls';

jest.mock('../../hooks/useTheme');

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
  it('renders skip and play/pause controls', () => {
    const tree = renderControls();
    for (const label of ['Skip back', 'Skip forward', 'Play']) {
      expect(
        tree.root.findAll((n) => n.props.accessibilityLabel === label).length,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders no Stop control', () => {
    const tree = renderControls({ status: 'playing' });
    expect(
      tree.root.findAll((n) => n.props.accessibilityLabel === 'Stop').length,
    ).toBe(0);
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

  it('disables controls when idle', () => {
    const tree = renderControls({ status: 'idle' });
    const skipBack = tree.root.find(
      (n) => n.props.accessibilityLabel === 'Skip back',
    );
    expect(skipBack.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  // The skip icons look the same whatever the skip preference is, so a caller
  // has to be able to say what the button will actually do.
  describe('skip labels', () => {
    it('takes labels describing the configured skip', () => {
      const tree = renderControls({
        skipBackLabel: 'Skip to start',
        skipForwardLabel: 'Skip forward 5m',
      });

      expect(
        tree.root.find((n) => n.props.accessibilityLabel === 'Skip to start'),
      ).toBeDefined();
      expect(
        tree.root.find((n) => n.props.accessibilityLabel === 'Skip forward 5m'),
      ).toBeDefined();
    });

    it('still presses through a custom label', () => {
      const onSkipForward = jest.fn();
      const tree = renderControls({
        skipForwardLabel: 'Skip to end',
        onSkipForward,
      });

      pressByLabel(tree, 'Skip to end');

      expect(onSkipForward).toHaveBeenCalledTimes(1);
    });
  });
});

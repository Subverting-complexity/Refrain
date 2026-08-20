import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { ControlsDrawer } from '../ControlsDrawer';
import { CountdownConfig } from '../../types';

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('../../hooks/useTheme');

// Stub the panel bodies so a test can detect which one is mounted by label
// without pulling in their full behavior.
jest.mock('../CountdownSettings', () => {
  const { View } = require('react-native');
  return {
    CountdownSettings: () => <View accessibilityLabel="countin-panel" />,
  };
});
jest.mock('../VolumeControl', () => {
  const { View } = require('react-native');
  return { VolumeControl: () => <View accessibilityLabel="volume-panel" /> };
});
jest.mock('../SkipControls', () => {
  const { View } = require('react-native');
  return { SkipControls: () => <View accessibilityLabel="skip-panel" /> };
});

const config: CountdownConfig = {
  enabled: false,
  mode: 'silent',
  duration: { type: 'seconds', seconds: 3 },
  repeat: 'once',
  bpm: 120,
};

function renderDrawer(
  props: Partial<React.ComponentProps<typeof ControlsDrawer>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ControlsDrawer
        countdownConfig={config}
        onCountdownConfigChange={jest.fn()}
        volume={0.5}
        onVolumeChange={jest.fn()}
        skipPreference={{ mode: 'interval', seconds: 5 }}
        onSkipPreferenceChange={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

function chip(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}

function panel(tree: ReactTestRenderer, label: string) {
  // Match only the host node (string type) so the mock's composite + host
  // wrapper pair is not double-counted.
  return tree.root.findAll(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );
}

function closeButton(tree: ReactTestRenderer, title: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === `Close ${title}` &&
      typeof node.props.onPress === 'function',
  )[0];
}

describe('ControlsDrawer', () => {
  it('renders the launcher squares plus Segments when a segments handler is given', () => {
    const tree = renderDrawer({ onOpenSegments: jest.fn() });
    expect(chip(tree, 'Count-in settings')).toBeDefined();
    expect(chip(tree, 'Volume settings')).toBeDefined();
    expect(chip(tree, 'Skip settings')).toBeDefined();
    expect(chip(tree, 'Open segment profiles')).toBeDefined();
  });

  it('hides the Segments square when no handler is provided', () => {
    const tree = renderDrawer();
    expect(chip(tree, 'Open segment profiles')).toBeUndefined();
  });

  it('opens a settings sheet on launcher tap and closes it from the sheet', () => {
    const tree = renderDrawer();
    expect(panel(tree, 'countin-panel')).toHaveLength(0);

    act(() => chip(tree, 'Count-in settings').props.onPress());
    expect(panel(tree, 'countin-panel')).toHaveLength(1);

    act(() => closeButton(tree, 'Count-in').props.onPress());
    expect(panel(tree, 'countin-panel')).toHaveLength(0);
  });

  it('shows only one settings sheet at a time', () => {
    const tree = renderDrawer();

    act(() => chip(tree, 'Count-in settings').props.onPress());
    expect(panel(tree, 'countin-panel')).toHaveLength(1);

    act(() => chip(tree, 'Volume settings').props.onPress());
    expect(panel(tree, 'countin-panel')).toHaveLength(0);
    expect(panel(tree, 'volume-panel')).toHaveLength(1);
  });

  it('opens the segments sheet without opening a settings sheet', () => {
    const onOpenSegments = jest.fn();
    const tree = renderDrawer({ onOpenSegments });

    act(() => chip(tree, 'Open segment profiles').props.onPress());

    expect(onOpenSegments).toHaveBeenCalledTimes(1);
    expect(panel(tree, 'countin-panel')).toHaveLength(0);
    expect(panel(tree, 'volume-panel')).toHaveLength(0);
    expect(panel(tree, 'skip-panel')).toHaveLength(0);
  });
});

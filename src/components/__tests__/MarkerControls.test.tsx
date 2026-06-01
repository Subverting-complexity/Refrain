import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { MarkerControls } from '../MarkerControls';

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
  props: Partial<React.ComponentProps<typeof MarkerControls>> = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <MarkerControls
        status="paused"
        positionMs={5000}
        markerA={null}
        markerB={null}
        onSetMarkerA={jest.fn()}
        onSetMarkerB={jest.fn()}
        onClearMarkers={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

function findPressableByLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
}

function findViewByLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress !== 'function',
  );
}

describe('MarkerControls', () => {
  it('renders Set A and Set B buttons', () => {
    const tree = renderControls();
    expect(
      findPressableByLabel(tree, 'Set loop start').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      findPressableByLabel(tree, 'Set loop end').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders clear button', () => {
    const tree = renderControls();
    expect(
      findPressableByLabel(tree, 'Clear loop markers').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('calls onSetMarkerA with current position when A button pressed', () => {
    const onSetMarkerA = jest.fn();
    const tree = renderControls({ positionMs: 3000, onSetMarkerA });

    const button = findPressableByLabel(tree, 'Set loop start')[0];
    act(() => {
      button.props.onPress();
    });

    expect(onSetMarkerA).toHaveBeenCalledWith(3000);
  });

  it('calls onSetMarkerB with current position when B button pressed', () => {
    const onSetMarkerB = jest.fn();
    const tree = renderControls({ positionMs: 8000, onSetMarkerB });

    const button = findPressableByLabel(tree, 'Set loop end')[0];
    act(() => {
      button.props.onPress();
    });

    expect(onSetMarkerB).toHaveBeenCalledWith(8000);
  });

  it('calls onClearMarkers when clear button pressed', () => {
    const onClearMarkers = jest.fn();
    const tree = renderControls({
      markerA: 1000,
      markerB: 5000,
      onClearMarkers,
    });

    const button = findPressableByLabel(tree, 'Clear loop markers')[0];
    act(() => {
      button.props.onPress();
    });

    expect(onClearMarkers).toHaveBeenCalled();
  });

  it('disables A and B buttons when status is idle', () => {
    const tree = renderControls({ status: 'idle' });

    const setA = findPressableByLabel(tree, 'Set loop start')[0];
    const setB = findPressableByLabel(tree, 'Set loop end')[0];

    expect(setA.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(setB.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('disables A and B buttons when status is error', () => {
    const tree = renderControls({ status: 'error' });

    const setA = findPressableByLabel(tree, 'Set loop start')[0];
    expect(setA.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('disables clear button when no markers are set', () => {
    const tree = renderControls({ markerA: null, markerB: null });

    const clear = findPressableByLabel(tree, 'Clear loop markers')[0];
    expect(clear.props.disabled).toBe(true);
  });

  it('enables clear button when markers are set', () => {
    const tree = renderControls({ markerA: 1000, markerB: 5000 });

    const clear = findPressableByLabel(tree, 'Clear loop markers')[0];
    expect(clear.props.disabled).toBe(false);
  });

  it('shows loop badge when both markers are set', () => {
    const tree = renderControls({ markerA: 1000, markerB: 5000 });

    const badge = findViewByLabel(tree, 'Loop active');
    expect(badge.length).toBeGreaterThanOrEqual(1);
  });

  it('hides loop badge when only one marker is set', () => {
    const tree = renderControls({ markerA: 1000, markerB: null });

    const badge = findViewByLabel(tree, 'Loop active');
    expect(badge.length).toBe(0);
  });

  it('highlights A button with accent color when markerA is set', () => {
    const tree = renderControls({ markerA: 1000 });

    const button = findPressableByLabel(tree, 'Set loop start')[0];
    const textNodes = button.findAll(
      (node) => node.type === 'Text' && node.props.children === 'A',
    );
    expect(textNodes).toHaveLength(1);
    const textStyle = textNodes[0].props.style;
    const hasAccentText = textStyle.some(
      (s: Record<string, unknown>) => s && s.color === '#111d1f',
    );
    expect(hasAccentText).toBe(true);
  });

  it('accepts style prop override', () => {
    const tree = renderControls({ style: { marginTop: 10 } });
    const container = tree.root.children[0];
    const flatStyle = (
      container as { props: { style: Record<string, unknown>[] } }
    ).props.style;
    const hasMargin = flatStyle.some(
      (s: Record<string, unknown>) => s && s.marginTop === 10,
    );
    expect(hasMargin).toBe(true);
  });
});

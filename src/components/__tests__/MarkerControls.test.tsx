import React from 'react';
import { StyleSheet } from 'react-native';
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
        markerA: '#ffb02e',
        markerAText: '#3a2600',
        markerB: '#ff5d77',
        markerBText: '#ffffff',
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
        markerA={null}
        markerB={null}
        loopEnabled={true}
        onToggleLoop={jest.fn()}
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

function findReadoutByLabelFragment(tree: ReactTestRenderer, fragment: string) {
  return tree.root.findAll(
    (node) =>
      node.type === 'View' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.includes(fragment),
  );
}

function findText(tree: ReactTestRenderer, text: string) {
  return tree.root.findAll(
    (node) => node.type === 'Text' && node.props.children === text,
  );
}

function findCaption(tree: ReactTestRenderer, fragment: string) {
  return tree.root.findAll(
    (node) =>
      node.type === 'Text' &&
      typeof node.props.children === 'string' &&
      node.props.children.includes(fragment),
  );
}

describe('MarkerControls', () => {
  it('renders A and B read-outs', () => {
    const tree = renderControls();
    expect(findText(tree, 'A').length).toBeGreaterThanOrEqual(1);
    expect(findText(tree, 'B').length).toBeGreaterThanOrEqual(1);
  });

  it('shows a dash for an unset marker and a time for a set one', () => {
    const tree = renderControls({ markerA: 65000, markerB: null });
    expect(findText(tree, '1:05').length).toBe(1);
    expect(findText(tree, '—').length).toBe(1);
  });

  it('labels the read-outs for accessibility', () => {
    const tree = renderControls({ markerA: 5000, markerB: null });
    expect(
      findReadoutByLabelFragment(tree, 'Loop start 0:05').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      findReadoutByLabelFragment(tree, 'Loop end not set').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders clear button', () => {
    const tree = renderControls();
    expect(
      findPressableByLabel(tree, 'Clear loop markers').length,
    ).toBeGreaterThanOrEqual(1);
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

  it('renders the loop toggle', () => {
    const tree = renderControls({
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
    });

    expect(
      findPressableByLabel(tree, 'Turn loop off').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('disables the loop toggle until both markers are set', () => {
    const tree = renderControls({ markerA: 1000, markerB: null });

    const toggle = findPressableByLabel(tree, 'Turn loop on')[0];
    expect(toggle.props.disabled).toBe(true);
    expect(toggle.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('enables and checks the loop toggle when both markers set and looping', () => {
    const tree = renderControls({
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
    });

    const toggle = findPressableByLabel(tree, 'Turn loop off')[0];
    expect(toggle.props.disabled).toBe(false);
    expect(toggle.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true, disabled: false }),
    );
  });

  it('shows the loop toggle unchecked when looping is off', () => {
    const tree = renderControls({
      markerA: 1000,
      markerB: 5000,
      loopEnabled: false,
    });

    const toggle = findPressableByLabel(tree, 'Turn loop on')[0];
    expect(toggle.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false, disabled: false }),
    );
  });

  it('calls onToggleLoop with the negated state when pressed', () => {
    const onToggleLoop = jest.fn();
    const tree = renderControls({
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
      onToggleLoop,
    });

    const toggle = findPressableByLabel(tree, 'Turn loop off')[0];
    act(() => {
      toggle.props.onPress();
    });

    expect(onToggleLoop).toHaveBeenCalledWith(false);
  });

  it('shows a guidance caption for the current marker state', () => {
    expect(
      findCaption(renderControls(), 'Tap the wave to set A').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      findCaption(renderControls({ markerA: 1000 }), 'set B').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      findCaption(
        renderControls({ markerA: 1000, markerB: 5000, loopEnabled: true }),
        'Looping',
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('hides the caption when playback is idle', () => {
    const tree = renderControls({ status: 'idle' });
    expect(findCaption(tree, 'Tap the wave')).toHaveLength(0);
  });

  it('tints the A read-out border with the marker A color when set', () => {
    const tree = renderControls({ markerA: 1000 });

    const readout = findReadoutByLabelFragment(tree, 'Loop start 0:01')[0];
    const flat = StyleSheet.flatten(readout.props.style);
    expect(flat.borderColor).toBe('#ffb02e');
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

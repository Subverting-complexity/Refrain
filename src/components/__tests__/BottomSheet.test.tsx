import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, ViewStyle } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet } from '../BottomSheet';

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('../../hooks/useTheme');

function renderSheet(
  props: Partial<React.ComponentProps<typeof BottomSheet>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <BottomSheet title="Volume" onClose={jest.fn()} {...props}>
        <Text>Sheet body</Text>
      </BottomSheet>,
    );
  });
  return tree;
}

describe('BottomSheet', () => {
  it('renders the title and children', () => {
    const tree = renderSheet();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Volume');
    expect(json).toContain('Sheet body');
  });

  it('renders both close affordances with the default label and button role', () => {
    const tree = renderSheet();
    const affordances = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Close Volume' &&
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function',
    );
    // Backdrop plus header close button.
    expect(affordances.length).toBeGreaterThanOrEqual(2);
  });

  it('uses a custom closeLabel when provided', () => {
    const tree = renderSheet({ closeLabel: 'Dismiss volume settings' });
    const affordances = tree.root.findAll(
      (node) => node.props.accessibilityLabel === 'Dismiss volume settings',
    );
    expect(affordances.length).toBeGreaterThanOrEqual(1);
    expect(
      tree.root.findAll(
        (node) => node.props.accessibilityLabel === 'Close Volume',
      ).length,
    ).toBe(0);
  });

  it('calls onClose when the close button is pressed', () => {
    const onClose = jest.fn();
    const tree = renderSheet({ onClose });
    const affordances = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Close Volume' &&
        typeof node.props.onPress === 'function',
    );
    act(() => affordances[affordances.length - 1].props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('wires onClose to the modal hardware-back request', () => {
    const onClose = jest.fn();
    const tree = renderSheet({ onClose });
    const modal = tree.root.findByType(Modal);
    act(() => modal.props.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a transparent slide-up modal', () => {
    const tree = renderSheet();
    const modal = tree.root.findByType(Modal);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.animationType).toBe('slide');
    expect(modal.props.visible).toBe(true);
  });

  // Every sheet in the player shares this scaffold, so an unbounded body here
  // pushed content off the bottom of the screen with no way to reach it — a
  // saved-segment list of any length was entirely unreachable.
  describe('tall content', () => {
    it('puts the body in a scroll view so it stays reachable', () => {
      const tree = renderSheet();
      const scroll = tree.root.findByType(ScrollView);
      expect(JSON.stringify(scroll.props.children)).toContain('Sheet body');
    });

    it('caps the sheet below the viewport so a tall body scrolls instead of overflowing', () => {
      const tree = renderSheet();
      const scroll = tree.root.findByType(ScrollView);
      // The sheet is the ScrollView's nearest ancestor View carrying the
      // rounded-top surface style.
      const sheet = scroll.parent!;
      const style = StyleSheet.flatten(sheet.props.style) as ViewStyle;
      expect(style.maxHeight).toBe('85%');
    });

    it('keeps taps working on controls inside the scrollable body', () => {
      const tree = renderSheet();
      const scroll = tree.root.findByType(ScrollView);
      expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    });
  });
});

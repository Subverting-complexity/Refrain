import React from 'react';
import { Modal, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet } from '../BottomSheet';

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        overlay: 'rgba(0,0,0,0.5)',
        surface: '#1a2e30',
        textPrimary: '#e8f5f0',
        textSecondary: '#8fa89e',
      },
      typography: { heading: {} },
    },
  }),
}));

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
});

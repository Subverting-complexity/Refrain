import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { IconSquareButton } from '../IconSquareButton';

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
        accent: '#0f0',
        accentText: '#000',
        surface: '#111',
        border: '#333',
        textSecondary: '#aaa',
      },
    },
  }),
}));

function renderButton(
  props: Partial<React.ComponentProps<typeof IconSquareButton>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <IconSquareButton
        icon="repeat"
        accessibilityLabel="Test button"
        onPress={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

function findHost(tree: ReactTestRenderer) {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Test button' &&
      typeof node.props.onPress === 'function',
  );
  return nodes[nodes.length - 1];
}

describe('IconSquareButton', () => {
  it('renders with default size 44x44', () => {
    const tree = renderButton();
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: false }));
    expect(flat.width).toBe(44);
    expect(flat.height).toBe(44);
  });

  it('respects a custom size', () => {
    const tree = renderButton({ size: 48 });
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: false }));
    expect(flat.width).toBe(48);
    expect(flat.height).toBe(48);
  });

  it('uses accent colors when active', () => {
    const tree = renderButton({ active: true });
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: false }));
    expect(flat.backgroundColor).toBe('#0f0');
    expect(flat.borderColor).toBe('#0f0');
  });

  it('uses surface colors when inactive', () => {
    const tree = renderButton({ active: false });
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: false }));
    expect(flat.backgroundColor).toBe('#111');
    expect(flat.borderColor).toBe('#333');
  });

  it('sets opacity 0.4 when disabled', () => {
    const tree = renderButton({ disabled: true });
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: false }));
    expect(flat.opacity).toBe(0.4);
  });

  it('sets opacity 0.7 when pressed', () => {
    const tree = renderButton();
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: true }));
    expect(flat.opacity).toBe(0.7);
  });

  it('sets opacity 1 in resting state', () => {
    const tree = renderButton();
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: false }));
    expect(flat.opacity).toBe(1);
  });

  it('passes the disabled prop to the pressable', () => {
    const tree = renderButton({ disabled: true });
    const node = findHost(tree);
    expect(node.props.disabled).toBe(true);
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const tree = renderButton({ onPress });
    act(() => findHost(tree).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('merges disabled into accessibilityState', () => {
    const tree = renderButton({
      disabled: true,
      accessibilityState: { checked: true },
    });
    const node = findHost(tree);
    expect(node.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true, checked: true }),
    );
  });

  it('defaults accessibilityRole to button', () => {
    const tree = renderButton();
    const node = findHost(tree);
    expect(node.props.accessibilityRole).toBe('button');
  });

  it('accepts accessibilityRole switch', () => {
    const tree = renderButton({ accessibilityRole: 'switch' });
    const node = findHost(tree);
    expect(node.props.accessibilityRole).toBe('switch');
  });

  it('passes accessibilityHint', () => {
    const tree = renderButton({ accessibilityHint: 'Toggle loop' });
    const node = findHost(tree);
    expect(node.props.accessibilityHint).toBe('Toggle loop');
  });

  it('passes testID', () => {
    const tree = renderButton({ testID: 'loop-btn' });
    const node = findHost(tree);
    expect(node.props.testID).toBe('loop-btn');
  });

  it('renders the icon with accentText color when active', () => {
    const tree = renderButton({ active: true });
    const icon = tree.root.findAll((node) => node.props.name === 'repeat')[0];
    expect(icon.props.color).toBe('#000');
  });

  it('renders the icon with textSecondary color when inactive', () => {
    const tree = renderButton({ active: false });
    const icon = tree.root.findAll((node) => node.props.name === 'repeat')[0];
    expect(icon.props.color).toBe('#aaa');
  });
});

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { AccessiblePressable } from '../AccessiblePressable';

function renderPressable(
  props: Partial<React.ComponentProps<typeof AccessiblePressable>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel="Test pressable"
        onPress={jest.fn()}
        {...props}
      >
        <Text>Child content</Text>
      </AccessiblePressable>,
    );
  });
  return tree;
}

function findHost(tree: ReactTestRenderer) {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Test pressable' &&
      typeof node.props.onPress === 'function',
  );
  return nodes[nodes.length - 1];
}

describe('AccessiblePressable', () => {
  it('applies the 44pt minimum touch target', () => {
    const tree = renderPressable();
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: false }));
    expect(flat.minWidth).toBe(44);
    expect(flat.minHeight).toBe(44);
  });

  it('centers its content by default', () => {
    const tree = renderPressable();
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: false }));
    expect(flat.justifyContent).toBe('center');
    expect(flat.alignItems).toBe('center');
  });

  it('renders its children', () => {
    const tree = renderPressable();
    expect(JSON.stringify(tree.toJSON())).toContain('Child content');
  });

  it('merges object style overrides on top of the base style', () => {
    const tree = renderPressable({
      style: { minHeight: 60, backgroundColor: '#123456' },
    });
    const node = findHost(tree);
    const flat = StyleSheet.flatten(node.props.style({ pressed: false }));
    expect(flat.minHeight).toBe(60);
    expect(flat.minWidth).toBe(44);
    expect(flat.backgroundColor).toBe('#123456');
  });

  it('resolves function styles with the pressed state', () => {
    const tree = renderPressable({
      style: ({ pressed }) => ({ opacity: pressed ? 0.5 : 1 }),
    });
    const node = findHost(tree);
    const resting = StyleSheet.flatten(node.props.style({ pressed: false }));
    const pressed = StyleSheet.flatten(node.props.style({ pressed: true }));
    expect(resting.opacity).toBe(1);
    expect(resting.minWidth).toBe(44);
    expect(pressed.opacity).toBe(0.5);
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const tree = renderPressable({ onPress });
    act(() => findHost(tree).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('passes accessibility props through to the pressable', () => {
    const tree = renderPressable({
      accessibilityRole: 'link',
      accessibilityState: { disabled: true },
      accessibilityHint: 'Opens the page',
      testID: 'nav-link',
    });
    const node = findHost(tree);
    expect(node.props.accessibilityRole).toBe('link');
    expect(node.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(node.props.accessibilityHint).toBe('Opens the page');
    expect(node.props.testID).toBe('nav-link');
  });
});

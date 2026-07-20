import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { DialogButton } from '../DialogButton';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        accentText: '#0a1612',
        error: '#f87171',
        textPrimary: '#e8f5f0',
        border: '#2d4a40',
      },
      typography: { body: {} },
    },
  }),
}));

function renderButton(
  props: Partial<React.ComponentProps<typeof DialogButton>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<DialogButton label="Save" onPress={jest.fn()} {...props} />);
  });
  return tree;
}

function findHost(tree: ReactTestRenderer, label = 'Save') {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  return nodes[nodes.length - 1];
}

describe('DialogButton', () => {
  it('renders the label text with the button role', () => {
    const tree = renderButton();
    expect(JSON.stringify(tree.toJSON())).toContain('Save');
    expect(findHost(tree).props.accessibilityRole).toBe('button');
  });

  it('defaults the accessibility label to the visible label', () => {
    const tree = renderButton();
    expect(findHost(tree)).toBeDefined();
  });

  it('uses a custom accessibilityLabel when provided', () => {
    const tree = renderButton({ accessibilityLabel: 'Save segment' });
    expect(findHost(tree, 'Save segment')).toBeDefined();
    expect(
      tree.root.findAll((n) => n.props.accessibilityLabel === 'Save').length,
    ).toBe(0);
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const tree = renderButton({ onPress });
    act(() => findHost(tree).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fills the primary variant with the accent color', () => {
    const tree = renderButton({ variant: 'primary' });
    const flat = StyleSheet.flatten(
      findHost(tree).props.style({ pressed: false }),
    );
    expect(flat.backgroundColor).toBe('#7edbb8');
    expect(flat.borderWidth).toBeUndefined();
  });

  it('renders the primary label in accentText color', () => {
    const tree = renderButton({ variant: 'primary' });
    const text = tree.root.findAllByType(Text)[0];
    expect(StyleSheet.flatten(text.props.style).color).toBe('#0a1612');
  });

  it('outlines the default variant with the border color', () => {
    const tree = renderButton({ variant: 'default' });
    const flat = StyleSheet.flatten(
      findHost(tree).props.style({ pressed: false }),
    );
    expect(flat.backgroundColor).toBeUndefined();
    expect(flat.borderWidth).toBe(1);
    expect(flat.borderColor).toBe('#2d4a40');
  });

  it('renders the default label in textPrimary color', () => {
    const tree = renderButton();
    const text = tree.root.findAllByType(Text)[0];
    expect(StyleSheet.flatten(text.props.style).color).toBe('#e8f5f0');
  });

  it('renders the danger label in the error color on an outlined button', () => {
    const tree = renderButton({ variant: 'danger' });
    const text = tree.root.findAllByType(Text)[0];
    expect(StyleSheet.flatten(text.props.style).color).toBe('#f87171');
    const flat = StyleSheet.flatten(
      findHost(tree).props.style({ pressed: false }),
    );
    expect(flat.borderWidth).toBe(1);
  });

  it('dims to opacity 0.7 while pressed', () => {
    const tree = renderButton();
    const host = findHost(tree);
    expect(
      StyleSheet.flatten(host.props.style({ pressed: true })).opacity,
    ).toBe(0.7);
    expect(
      StyleSheet.flatten(host.props.style({ pressed: false })).opacity,
    ).toBe(1);
  });
});

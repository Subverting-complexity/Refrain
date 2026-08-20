import React from 'react';
import { ActivityIndicator } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { ImportButton } from '../ImportButton';

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('../../hooks/useTheme');

function renderButton(
  props: Partial<React.ComponentProps<typeof ImportButton>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ImportButton onPress={jest.fn()} {...props} />);
  });
  return tree;
}

function findHost(tree: ReactTestRenderer) {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Import audio file' &&
      typeof node.props.onPress === 'function',
  );
  return nodes[nodes.length - 1];
}

describe('ImportButton', () => {
  it('renders the label and icon when idle', () => {
    const tree = renderButton();
    expect(JSON.stringify(tree.toJSON())).toContain('Import Audio');
    expect(
      tree.root.findAll((n) => n.props.name === 'add-circle-outline').length,
    ).toBeGreaterThanOrEqual(1);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(0);
  });

  it('exposes an accessible button that is not busy when idle', () => {
    const tree = renderButton();
    const host = findHost(tree);
    expect(host.props.accessibilityRole).toBe('button');
    expect(host.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: false }),
    );
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const tree = renderButton({ onPress });
    act(() => findHost(tree).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner instead of the label while loading', () => {
    const tree = renderButton({ loading: true });
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
    expect(JSON.stringify(tree.toJSON())).not.toContain('Import Audio');
  });

  it('disables the button and marks it busy while loading', () => {
    const tree = renderButton({ loading: true });
    const host = findHost(tree);
    expect(host.props.disabled).toBe(true);
    expect(host.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true }),
    );
  });
});

import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { HeaderBackButton } from '../HeaderBackButton';

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: mockCanGoBack }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('../../hooks/useTheme');

function renderButton(
  props: Partial<React.ComponentProps<typeof HeaderBackButton>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<HeaderBackButton {...props} />);
  });
  return tree;
}

function findPressable(tree: ReactTestRenderer, label: string) {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  return nodes[nodes.length - 1];
}

function textContentOf(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }
  if (Array.isArray(node)) {
    return node.flatMap(textContentOf);
  }
  if (node && typeof node === 'object' && 'children' in node) {
    return textContentOf((node as { children: unknown }).children);
  }
  return [];
}

describe('HeaderBackButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('renders a button labelled Go back', () => {
    const tree = renderButton();
    expect(findPressable(tree, 'Go back')).toBeDefined();
  });

  it('shows a chevron icon', () => {
    const tree = renderButton();
    const icons = tree.root.findAll(
      (node) => node.props.name === 'chevron-back',
    );
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders no visible text', () => {
    const tree = renderButton();
    expect(textContentOf(tree.toJSON())).toEqual([]);
  });

  it('goes back when pressed', () => {
    const tree = renderButton();
    act(() => findPressable(tree, 'Go back').props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there is no screen to go back to', () => {
    mockCanGoBack.mockReturnValue(false);
    const tree = renderButton();
    expect(tree.toJSON()).toBeNull();
  });

  it('accepts a custom accessibility label', () => {
    const tree = renderButton({ accessibilityLabel: 'Back to library' });
    expect(findPressable(tree, 'Back to library')).toBeDefined();
  });
});

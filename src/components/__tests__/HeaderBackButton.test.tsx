import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  HEADER_BACK_BUTTON_TEST_ID,
  HeaderBackButton,
} from '../HeaderBackButton';

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

function renderButton(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<HeaderBackButton />);
  });
  return tree;
}

function findPressable(tree: ReactTestRenderer) {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Go back' &&
      typeof node.props.onPress === 'function',
  );
  return nodes[nodes.length - 1];
}

/** Every string rendered anywhere in the tree. */
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
    expect(findPressable(renderButton())).toBeDefined();
  });

  it('shows a chevron icon', () => {
    const icons = renderButton().root.findAll(
      (node) => node.props.name === 'chevron-back',
    );
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders no visible text', () => {
    // The icon is mocked as a View, so any string here would be a label.
    expect(textContentOf(renderButton().toJSON())).toEqual([]);
  });

  it('exposes a stable testID for end-to-end tests', () => {
    const tagged = renderButton().root.findAll(
      (node) => node.props.testID === HEADER_BACK_BUTTON_TEST_ID,
    );
    expect(tagged.length).toBeGreaterThanOrEqual(1);
  });

  it('goes back when pressed', () => {
    const tree = renderButton();
    act(() => findPressable(tree).props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('ignores a repeat press once there is nothing left to pop', () => {
    const tree = renderButton();
    const press = findPressable(tree).props.onPress;
    act(() => press());
    mockCanGoBack.mockReturnValue(false);
    act(() => press());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

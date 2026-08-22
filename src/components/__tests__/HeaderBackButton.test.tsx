import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  HEADER_BACK_BUTTON_TEST_ID,
  HeaderBackButton,
} from '../HeaderBackButton';

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
/** Focus callbacks registered via the mocked `useFocusEffect`. */
const focusCallbacks: (() => void)[] = [];

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useRouter: () => ({ back: mockBack, canGoBack: mockCanGoBack }),
    // Stand in for a screen that is focused on mount: run the effect, and
    // keep it so a test can simulate the screen being focused again.
    useFocusEffect: (effect: () => void) => {
      ReactLocal.useEffect(() => {
        focusCallbacks.push(effect);
        effect();
      }, [effect]);
    },
  };
});

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

function pressHandler(tree: ReactTestRenderer): () => void {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Go back' &&
      typeof node.props.onPress === 'function',
  );
  return nodes[nodes.length - 1].props.onPress;
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
    focusCallbacks.length = 0;
  });

  it('renders a button labelled Go back', () => {
    expect(pressHandler(renderButton())).toBeDefined();
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

  it('exposes a stable testID', () => {
    const tagged = renderButton().root.findAll(
      (node) => node.props.testID === HEADER_BACK_BUTTON_TEST_ID,
    );
    expect(tagged.length).toBeGreaterThanOrEqual(1);
  });

  it('goes back when pressed', () => {
    const press = pressHandler(renderButton());
    act(() => press());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('pops only once when double-tapped mid-stack', () => {
    // The real double-tap: `back()` only queues the pop, so `canGoBack()`
    // still reads true on the second press. Without a latch both presses
    // would queue a pop and two screens would come off the stack.
    const press = pressHandler(renderButton());
    act(() => {
      press();
      press();
    });
    expect(mockCanGoBack()).toBe(true);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('does not go back when there is nothing left to pop', () => {
    mockCanGoBack.mockReturnValue(false);
    const press = pressHandler(renderButton());
    act(() => press());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('works again when the screen is focused after a pop that did not happen', () => {
    const tree = renderButton();
    const press = pressHandler(tree);
    act(() => press());
    expect(mockBack).toHaveBeenCalledTimes(1);

    // The screen is still here, so it regains focus rather than unmounting.
    act(() => focusCallbacks.forEach((cb) => cb()));
    act(() => press());
    expect(mockBack).toHaveBeenCalledTimes(2);
  });
});

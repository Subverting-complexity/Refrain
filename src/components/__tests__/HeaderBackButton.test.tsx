import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { darkTheme } from '../../theme';

import {
  HEADER_BACK_BUTTON_TEST_ID,
  HeaderBackButton,
  headerBackButtonOptions,
  POP_GUARD_MS,
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

function chevron(tree: ReactTestRenderer) {
  return tree.root.findAll((node) => node.props.name === 'chevron-back')[0];
}

describe('HeaderBackButton', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
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
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('does not go back when there is nothing left to pop', () => {
    mockCanGoBack.mockReturnValue(false);
    const press = pressHandler(renderButton());
    act(() => press());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('works again once the guard window passes on a pop that was blocked', () => {
    // A pop can be cancelled without the screen ever blurring: the
    // player's unsaved-edits guard prevents `beforeRemove` and shows a
    // dialog in the same route. Releasing on focus would never fire
    // there, so the button has to come back on its own.
    const press = pressHandler(renderButton());
    act(() => press());
    expect(mockBack).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(POP_GUARD_MS);
    });
    act(() => press());
    expect(mockBack).toHaveBeenCalledTimes(2);
  });

  it('still suppresses a second press just before the window closes', () => {
    const press = pressHandler(renderButton());
    act(() => press());
    act(() => {
      jest.advanceTimersByTime(POP_GUARD_MS - 1);
    });
    act(() => press());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('clears its pending timer on unmount', () => {
    const tree = renderButton();
    act(() => pressHandler(tree)());
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    act(() => tree.unmount());
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  // A header is bare `background` with nothing else on it, so the filled
  // square this used to render read as a stray tile rather than as one of
  // the bar's controls.
  it('renders the chevron without a fill or a border', () => {
    const tree = renderButton();
    const nodes = tree.root.findAll(
      (node) =>
        node.props.testID === HEADER_BACK_BUTTON_TEST_ID &&
        typeof node.props.style === 'function',
    );
    const flat = StyleSheet.flatten(
      nodes[nodes.length - 1].props.style({ pressed: false }),
    );
    expect(flat.backgroundColor).toBe('transparent');
    expect(flat.borderColor).toBe('transparent');
  });

  it('draws the chevron in the header title color', () => {
    expect(chevron(renderButton()).props.color).toBe(
      darkTheme.colors.textPrimary,
    );
  });
});

describe('headerBackButtonOptions', () => {
  let replacedPlatform: { restore: () => void } | undefined;

  /**
   * Runs the rest of the test as though it were on `os`.
   *
   * The replacement is undone by hand in `afterEach`. Jest does not
   * restore it on its own here: `restoreMocks` is off, and
   * `jest.restoreAllMocks()` would also undo the `Animated.timing` spy
   * that `jest.setup.js` installs for every suite. Left in place, the
   * last platform set here would silently apply to any test added after
   * this block.
   */
  function onPlatform(os: 'ios' | 'android' | 'web'): void {
    replacedPlatform = jest.replaceProperty(Platform, 'OS', os);
  }

  afterEach(() => {
    replacedPlatform?.restore();
    replacedPlatform = undefined;
  });

  /** Renders a header-left element and reports whether it holds the button. */
  function hasBackButton(element: React.ReactNode): boolean {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<>{element}</>);
    });
    return (
      tree.root.findAll((node) => node.props.accessibilityLabel === 'Go back')
        .length > 0
    );
  }

  describe('on iOS', () => {
    beforeEach(() => {
      onPlatform('ios');
    });

    // iOS 26 wraps a plain `headerLeft` view in the navigation bar's
    // shared background, which paints as a light capsule over this app's
    // dark header. Only a custom header item can turn that off.
    it('supplies the button as a header item, not as headerLeft', () => {
      const options = headerBackButtonOptions();
      expect(options.unstable_headerLeftItems).toBeDefined();
      expect(options.headerLeft).toBeUndefined();
    });

    it('hides the shared background behind the item', () => {
      const items = headerBackButtonOptions().unstable_headerLeftItems?.({
        canGoBack: true,
      });
      expect(items).toHaveLength(1);
      expect(items?.[0]).toMatchObject({
        type: 'custom',
        hidesSharedBackground: true,
      });
    });

    it('carries the app back button as the item element', () => {
      const item = headerBackButtonOptions().unstable_headerLeftItems?.({
        canGoBack: true,
      })?.[0];
      expect(item?.type).toBe('custom');
      expect(hasBackButton(item?.type === 'custom' ? item.element : null)).toBe(
        true,
      );
    });

    it('supplies no items when there is nothing beneath', () => {
      const options = headerBackButtonOptions();
      expect(options.unstable_headerLeftItems?.({ canGoBack: false })).toEqual(
        [],
      );
      expect(options.unstable_headerLeftItems?.({})).toEqual([]);
    });
  });

  describe.each(['android', 'web'] as const)('on %s', (platform) => {
    beforeEach(() => {
      onPlatform(platform);
    });

    // Neither platform has a shared background, and both ignore
    // `unstable_headerLeftItems`, so the button goes in as headerLeft.
    it('supplies the button as headerLeft', () => {
      const options = headerBackButtonOptions();
      expect(options.unstable_headerLeftItems).toBeUndefined();
      expect(hasBackButton(options.headerLeft?.({ canGoBack: true }))).toBe(
        true,
      );
    });

    it('supplies a real null when there is nothing beneath', () => {
      // A component that renders null still creates a header-left view,
      // which on Android displaces the title out of the native toolbar.
      const options = headerBackButtonOptions();
      expect(options.headerLeft?.({ canGoBack: false })).toBeNull();
      expect(options.headerLeft?.({})).toBeNull();
    });
  });
});

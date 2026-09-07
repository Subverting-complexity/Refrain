import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
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
  bottomInset?: number,
): ReactTestRenderer {
  const sheet = (
    <BottomSheet title="Volume" onClose={jest.fn()} {...props}>
      <Text>Sheet body</Text>
    </BottomSheet>
  );
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      bottomInset === undefined ? (
        sheet
      ) : (
        <SafeAreaInsetsContext.Provider
          value={{ top: 24, left: 0, right: 0, bottom: bottomInset }}
        >
          {sheet}
        </SafeAreaInsetsContext.Provider>
      ),
    );
  });
  return tree;
}

/** The scroll content's flattened style, where the bottom padding lives. */
function bodyPadding(tree: ReactTestRenderer): number | undefined {
  const scroll = tree.root.findByType(ScrollView);
  const style = StyleSheet.flatten(
    scroll.props.contentContainerStyle,
  ) as ViewStyle;
  return style.paddingBottom as number | undefined;
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

  /**
   * A Modal is its own window on Android and only draws under the system bars
   * when told to, so a sheet that had not opted in left the backdrop undimmed
   * behind both bars while the app itself ran edge-to-edge (#315).
   */
  describe('Android system bars', () => {
    let replacedPlatform: ReturnType<typeof jest.replaceProperty> | undefined;

    afterEach(() => {
      replacedPlatform?.restore();
      replacedPlatform = undefined;
    });

    function onPlatform(os: 'ios' | 'android' | 'web'): void {
      replacedPlatform = jest.replaceProperty(Platform, 'OS', os);
    }

    it('extends the window under both system bars', () => {
      const modal = renderSheet().root.findByType(Modal);
      expect(modal.props.statusBarTranslucent).toBe(true);
      // React Native ignores this one unless statusBarTranslucent is set too.
      expect(modal.props.navigationBarTranslucent).toBe(true);
    });

    // The sheet is bottom-aligned, so once its window reaches the bottom of
    // the screen the last row sits under the navigation bar unless the body
    // reserves the inset. 32 alone is less than a 48dp three-button bar.
    it('reserves the navigation-bar inset on Android', () => {
      onPlatform('android');
      expect(bodyPadding(renderSheet({}, 48))).toBe(80);
    });

    it('reserves nothing extra under gesture navigation beyond its inset', () => {
      onPlatform('android');
      expect(bodyPadding(renderSheet({}, 24))).toBe(56);
    });

    it('leaves iOS padding unchanged', () => {
      onPlatform('ios');
      expect(bodyPadding(renderSheet({}, 34))).toBe(32);
    });

    it('leaves web padding unchanged', () => {
      onPlatform('web');
      expect(bodyPadding(renderSheet({}, 0))).toBe(32);
    });

    // Every existing sheet suite renders without a SafeAreaProvider, and so
    // does any screen that forgets one. `useSafeAreaInsets` throws in that
    // case; reading the context directly degrades to no inset instead.
    it('renders without a safe-area provider', () => {
      onPlatform('android');
      expect(bodyPadding(renderSheet())).toBe(32);
    });
  });

  /**
   * `undefined` on Android relied on the window being resized for the IME,
   * which the edge-to-edge layout no longer does, so a sheet with a text field
   * would open the keyboard straight over it (#317). CenteredDialog already
   * documented and used the correct behaviour; this matches it.
   */
  describe('keyboard avoidance', () => {
    let replacedPlatform: ReturnType<typeof jest.replaceProperty> | undefined;

    afterEach(() => {
      replacedPlatform?.restore();
      replacedPlatform = undefined;
    });

    function behaviorOn(os: 'ios' | 'android' | 'web'): unknown {
      replacedPlatform = jest.replaceProperty(Platform, 'OS', os);
      return renderSheet().root.findByType(KeyboardAvoidingView).props.behavior;
    }

    it('pads the container on iOS', () => {
      expect(behaviorOn('ios')).toBe('padding');
    });

    it('resizes the container on Android rather than leaving it to the window', () => {
      expect(behaviorOn('android')).toBe('height');
    });
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

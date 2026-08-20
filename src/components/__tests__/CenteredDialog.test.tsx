import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
} from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { CenteredDialog } from '../CenteredDialog';

jest.mock('../../hooks/useTheme');

function renderDialog(
  props: Partial<React.ComponentProps<typeof CenteredDialog>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <CenteredDialog title="Save segment" onDismiss={jest.fn()} {...props}>
        <Text>Dialog actions</Text>
      </CenteredDialog>,
    );
  });
  return tree;
}

describe('CenteredDialog', () => {
  it('renders the title and children', () => {
    const tree = renderDialog();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Save segment');
    expect(json).toContain('Dialog actions');
  });

  it('renders the supporting message when provided', () => {
    const tree = renderDialog({ message: 'You have unsaved changes.' });
    expect(JSON.stringify(tree.toJSON())).toContain(
      'You have unsaved changes.',
    );
  });

  it('omits the supporting message when not provided', () => {
    const tree = renderDialog();
    // Only the title and children text nodes should render.
    const texts = tree.root.findAllByType(Text);
    expect(texts.length).toBe(2);
  });

  it('renders a backdrop button labeled Dismiss dialog', () => {
    const tree = renderDialog();
    const backdrops = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Dismiss dialog' &&
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function',
    );
    expect(backdrops.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onDismiss when the backdrop is pressed', () => {
    const onDismiss = jest.fn();
    const tree = renderDialog({ onDismiss });
    const backdrops = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Dismiss dialog' &&
        typeof node.props.onPress === 'function',
    );
    act(() => backdrops[backdrops.length - 1].props.onPress());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('wires onDismiss to the modal hardware-back request', () => {
    const onDismiss = jest.fn();
    const tree = renderDialog({ onDismiss });
    const modal = tree.root.findByType(Modal);
    act(() => modal.props.onRequestClose());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders a transparent fade modal', () => {
    const tree = renderDialog();
    const modal = tree.root.findByType(Modal);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.animationType).toBe('fade');
    expect(modal.props.visible).toBe(true);
  });

  // These dialogs host autofocused text fields, so the card has to stay clear
  // of the on-screen keyboard and stay reachable once it is up.
  describe('keyboard avoidance', () => {
    it('avoids the keyboard with a platform-appropriate behavior', () => {
      const tree = renderDialog();
      const avoider = tree.root.findByType(KeyboardAvoidingView);
      // Under Android's edge-to-edge layout the window is no longer resized
      // for the IME, so leaving the behavior unset would drop the card behind
      // the keyboard.
      expect(avoider.props.behavior).toBe(
        Platform.OS === 'ios' ? 'padding' : 'height',
      );
    });

    it('lets a card taller than the reduced viewport scroll instead of clipping', () => {
      const tree = renderDialog();
      const scroll = tree.root.findByType(ScrollView);
      const style = scroll.props.style;
      // A ScrollView neither grows nor shrinks by default, so it would
      // overflow the shrunken overlay rather than scroll within it.
      expect(style).toEqual(
        expect.objectContaining({ flexGrow: 0, flexShrink: 1 }),
      );
    });

    it('lets the action buttons fire on the first tap while the keyboard is open', () => {
      const tree = renderDialog();
      const scroll = tree.root.findByType(ScrollView);
      expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    });

    it('keeps the backdrop covering the status bar area on Android', () => {
      const tree = renderDialog();
      expect(tree.root.findByType(Modal).props.statusBarTranslucent).toBe(true);
    });
  });
});

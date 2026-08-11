import React from 'react';
import { Modal, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { CenteredDialog } from '../CenteredDialog';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        overlay: 'rgba(0,0,0,0.5)',
        surface: '#1a2e30',
        textPrimary: '#e8f5f0',
        textSecondary: '#8fa89e',
      },
      typography: { heading: {}, body: {} },
    },
  }),
}));

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
});

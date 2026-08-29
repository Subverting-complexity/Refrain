import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import {
  ConfirmDestructiveDialog,
  ConfirmDestructiveDialogProps,
} from '../ConfirmDestructiveDialog';

jest.mock('../../hooks/useTheme');

function render(overrides: Partial<ConfirmDestructiveDialogProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ConfirmDestructiveDialog
        title="Delete track?"
        message="Remove it from your library?"
        confirmLabel="Delete"
        confirmAccessibilityLabel="Confirm delete Song.mp3"
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
        {...overrides}
      />,
    );
  });
  return tree;
}

function byLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}

function texts(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Text).map((node) => node.props.children);
}

describe('ConfirmDestructiveDialog', () => {
  it('shows the title and message it was given', () => {
    const rendered = texts(render());
    expect(rendered).toContain('Delete track?');
    expect(rendered).toContain('Remove it from your library?');
  });

  it('labels the confirm button with the label and spoken label given', () => {
    const tree = render();
    const confirm = byLabel(tree, 'Confirm delete Song.mp3');
    expect(confirm).toBeDefined();
    expect(texts(tree)).toContain('Delete');
  });

  it('defaults the cancel button to Cancel, spoken as its own label', () => {
    const tree = render();
    expect(byLabel(tree, 'Cancel')).toBeDefined();
  });

  it('uses the cancel labels it is given over the defaults', () => {
    const tree = render({
      cancelLabel: 'Keep',
      cancelAccessibilityLabel: 'Cancel delete',
    });
    expect(byLabel(tree, 'Cancel delete')).toBeDefined();
    expect(texts(tree)).toContain('Keep');
  });

  it('dismisses without confirming when cancelled', () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const tree = render({ onConfirm, onDismiss });
    act(() => byLabel(tree, 'Cancel').props.onPress());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dismisses without confirming when the backdrop is tapped', () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const tree = render({ onConfirm, onDismiss });
    act(() => byLabel(tree, 'Dismiss dialog').props.onPress());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('clears the dialog state before the async handler starts', () => {
    // The ordering is the reason this component exists. A re-render arriving
    // while the delete is in flight must not find the pending target still
    // set, so the dismiss has to land before the handler is even entered --
    // not merely before it resolves.
    const order: string[] = [];
    const onDismiss = jest.fn(() => {
      order.push('dismiss');
    });
    const onConfirm = jest.fn(() => {
      order.push('confirm');
    });

    const tree = render({ onConfirm, onDismiss });
    act(() => byLabel(tree, 'Confirm delete Song.mp3').props.onPress());

    expect(order).toEqual(['dismiss', 'confirm']);
  });
});

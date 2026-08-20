import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { Toast } from '../Toast';

jest.mock('../../hooks/useTheme');

function render(node: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(node);
  });
  return tree;
}

describe('Toast', () => {
  it('renders nothing when message is null', () => {
    const tree = render(<Toast message={null} onDismiss={jest.fn()} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders the message text', () => {
    const tree = render(
      <Toast message="Import failed: bad file" onDismiss={jest.fn()} />,
    );
    const text = tree.root.findAllByType(Text);
    expect(JSON.stringify(tree.toJSON())).toContain('Import failed: bad file');
    expect(text.length).toBeGreaterThan(0);
  });

  it('exposes the message as the alert accessibility label', () => {
    const tree = render(
      <Toast message="Track deleted" variant="success" onDismiss={jest.fn()} />,
    );
    const alert = tree.root.findByProps({ accessibilityRole: 'alert' });
    expect(alert.props.accessibilityLabel).toBe('Track deleted');
  });

  it('fires onDismiss when pressed', () => {
    const onDismiss = jest.fn();
    const tree = render(
      <Toast message="Library refreshed" onDismiss={onDismiss} />,
    );
    const alert = tree.root.findByProps({ accessibilityRole: 'alert' });
    act(() => {
      alert.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses the error color for the error variant', () => {
    const tree = render(
      <Toast
        message="Failed to delete track"
        variant="error"
        onDismiss={jest.fn()}
      />,
    );
    const icon = tree.root.findByProps({ name: 'alert-circle' });
    expect(icon.props.color).toBe('#f87171');
  });

  it('uses the success icon and accent color for the success variant', () => {
    const tree = render(
      <Toast message="Track deleted" variant="success" onDismiss={jest.fn()} />,
    );
    const icon = tree.root.findByProps({ name: 'checkmark-circle' });
    expect(icon.props.color).toBe('#7edbb8');
  });
});

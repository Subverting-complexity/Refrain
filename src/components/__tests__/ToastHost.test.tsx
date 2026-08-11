import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { ToastHost } from '../ToastHost';
import { ToastState } from '../../hooks/useToast';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        surface: '#1a2e30',
        textPrimary: '#e8f5f0',
        accent: '#7edbb8',
        error: '#f87171',
      },
      typography: { bodySmall: {} },
    },
  }),
}));

function render(node: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(node);
  });
  return tree;
}

const successToast: ToastState = {
  message: 'Track deleted',
  variant: 'success',
};
const errorToast: ToastState = {
  message: 'Failed to delete track',
  variant: 'error',
};

describe('ToastHost', () => {
  it('renders nothing when there is no toast', () => {
    const tree = render(<ToastHost toast={null} onDismiss={jest.fn()} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('exposes the message as the alert accessibility label', () => {
    const tree = render(
      <ToastHost toast={successToast} onDismiss={jest.fn()} />,
    );
    const alert = tree.root.findByProps({ accessibilityRole: 'alert' });
    expect(alert.props.accessibilityLabel).toBe('Track deleted');
  });

  // #179: the screens each unpacked the variant themselves and one re-applied
  // a 'success' default, so the same error toast rendered green on one screen
  // and red on the other. One host resolves it once, for both.
  it('renders an error toast with the error icon and colour', () => {
    const tree = render(<ToastHost toast={errorToast} onDismiss={jest.fn()} />);
    const icon = tree.root.findByProps({ name: 'alert-circle' });
    expect(icon.props.color).toBe('#f87171');
  });

  it('renders a success toast with the success icon and colour', () => {
    const tree = render(
      <ToastHost toast={successToast} onDismiss={jest.fn()} />,
    );
    const icon = tree.root.findByProps({ name: 'checkmark-circle' });
    expect(icon.props.color).toBe('#7edbb8');
  });

  it('fires onDismiss when pressed', () => {
    const onDismiss = jest.fn();
    const tree = render(
      <ToastHost toast={successToast} onDismiss={onDismiss} />,
    );

    act(() => {
      tree.root.findByProps({ accessibilityRole: 'alert' }).props.onPress();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

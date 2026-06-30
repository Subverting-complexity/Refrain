import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { MarkerTimeSheet } from '../MarkerTimeSheet';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        surface: '#1a2e30',
        textPrimary: '#e0f0eb',
        textSecondary: '#8ba89e',
        border: '#2a4a4e',
        error: '#ff5d77',
        overlay: 'rgba(0, 0, 0, 0.5)',
      },
      typography: {
        heading: { fontSize: 18, fontWeight: '600' },
        body: { fontSize: 15 },
        caption: { fontSize: 12 },
      },
    },
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

const defaultProps = {
  marker: 'A' as const,
  initialMs: 5000,
  durationMs: 120000,
  onCommit: jest.fn(),
  onRemove: jest.fn(),
  onDismiss: jest.fn(),
};

function renderSheet(
  props: Partial<React.ComponentProps<typeof MarkerTimeSheet>> = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<MarkerTimeSheet {...defaultProps} {...props} />);
  });
  return tree;
}

function findPressableByLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      (typeof node.props.onPress === 'function' ||
        typeof node.props.onPressIn === 'function'),
  );
}

function findTextContaining(tree: ReactTestRenderer, fragment: string) {
  return tree.root.findAll(
    (node) =>
      node.type === 'Text' &&
      typeof node.props.children === 'string' &&
      node.props.children.includes(fragment),
  );
}

describe('MarkerTimeSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the correct label for marker A', () => {
    const tree = renderSheet({ marker: 'A' });
    expect(
      findTextContaining(tree, 'Loop start').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders the correct label for marker B', () => {
    const tree = renderSheet({ marker: 'B' });
    expect(findTextContaining(tree, 'Loop end').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('displays the initial time in m:ss.t format', () => {
    const tree = renderSheet({ initialMs: 5000 });
    expect(findTextContaining(tree, '0:05.0').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onDismiss when the close button is pressed', () => {
    const onDismiss = jest.fn();
    const tree = renderSheet({ onDismiss });
    const closeButtons = findPressableByLabel(tree, 'Close marker editor');
    act(() => {
      closeButtons[0].props.onPress();
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it('calls onRemove when the remove button is pressed for marker A', () => {
    const onRemove = jest.fn();
    const tree = renderSheet({ marker: 'A', onRemove });
    const removeButton = findPressableByLabel(
      tree,
      'Remove loop start and end',
    )[0];
    act(() => {
      removeButton.props.onPress();
    });
    expect(onRemove).toHaveBeenCalled();
  });

  it('calls onRemove when the remove button is pressed for marker B', () => {
    const onRemove = jest.fn();
    const tree = renderSheet({ marker: 'B', onRemove });
    const removeButton = findPressableByLabel(tree, 'Remove loop end')[0];
    act(() => {
      removeButton.props.onPress();
    });
    expect(onRemove).toHaveBeenCalled();
  });

  it('calls onCommit immediately on decrease press', () => {
    const onCommit = jest.fn();
    const tree = renderSheet({ initialMs: 5000, onCommit });
    const decreaseBtn = findPressableByLabel(
      tree,
      'Decrease loop start by 100 milliseconds',
    )[0];
    act(() => {
      decreaseBtn.props.onPressIn();
    });
    expect(onCommit).toHaveBeenCalledWith(4900);
  });

  it('calls onCommit immediately on increase press', () => {
    const onCommit = jest.fn();
    const tree = renderSheet({ initialMs: 5000, onCommit });
    const increaseBtn = findPressableByLabel(
      tree,
      'Increase loop start by 100 milliseconds',
    )[0];
    act(() => {
      increaseBtn.props.onPressIn();
    });
    expect(onCommit).toHaveBeenCalledWith(5100);
  });

  it('jumps by 1 second on coarse decrease press', () => {
    const onCommit = jest.fn();
    const tree = renderSheet({ initialMs: 5000, onCommit });
    const coarseDecrease = findPressableByLabel(
      tree,
      'Decrease loop start by 1 second',
    )[0];
    act(() => {
      coarseDecrease.props.onPressIn();
    });
    expect(onCommit).toHaveBeenCalledWith(4000);
  });

  it('jumps by 1 second on coarse increase press', () => {
    const onCommit = jest.fn();
    const tree = renderSheet({ initialMs: 5000, onCommit });
    const coarseIncrease = findPressableByLabel(
      tree,
      'Increase loop start by 1 second',
    )[0];
    act(() => {
      coarseIncrease.props.onPressIn();
    });
    expect(onCommit).toHaveBeenCalledWith(6000);
  });

  it('clamps the coarse step at durationMs', () => {
    const onCommit = jest.fn();
    const tree = renderSheet({
      initialMs: 119500,
      durationMs: 120000,
      onCommit,
    });
    const coarseIncrease = findPressableByLabel(
      tree,
      'Increase loop start by 1 second',
    )[0];
    act(() => {
      coarseIncrease.props.onPressIn();
    });
    expect(onCommit).toHaveBeenCalledWith(120000);
  });

  it('clamps the value at 0 when decreasing past the start', () => {
    const onCommit = jest.fn();
    const tree = renderSheet({ initialMs: 50, onCommit });
    const decreaseBtn = findPressableByLabel(
      tree,
      'Decrease loop start by 100 milliseconds',
    )[0];
    act(() => {
      decreaseBtn.props.onPressIn();
    });
    expect(onCommit).toHaveBeenCalledWith(0);
  });

  it('clamps the value at durationMs when increasing past the end', () => {
    const onCommit = jest.fn();
    const tree = renderSheet({
      initialMs: 119950,
      durationMs: 120000,
      onCommit,
    });
    const increaseBtn = findPressableByLabel(
      tree,
      'Increase loop start by 100 milliseconds',
    )[0];
    act(() => {
      increaseBtn.props.onPressIn();
    });
    expect(onCommit).toHaveBeenCalledWith(120000);
  });

  it('repeats steps after hold delay', () => {
    const onCommit = jest.fn();
    const tree = renderSheet({ initialMs: 5000, onCommit });

    const increaseBtn = findPressableByLabel(
      tree,
      'Increase loop start by 100 milliseconds',
    )[0];
    act(() => {
      increaseBtn.props.onPressIn();
    });
    act(() => {
      jest.advanceTimersByTime(400);
    }); // initial delay fires
    act(() => {
      jest.advanceTimersByTime(300);
    }); // 3 repeat ticks at 100ms each
    // 1 immediate + 3 repeated = 4 calls minimum
    expect(onCommit.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('stops repeating when the button is released', () => {
    const onCommit = jest.fn();
    const tree = renderSheet({ initialMs: 5000, onCommit });

    const increaseBtn = findPressableByLabel(
      tree,
      'Increase loop start by 100 milliseconds',
    )[0];
    act(() => {
      increaseBtn.props.onPressIn();
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });
    act(() => {
      increaseBtn.props.onPressOut();
    });
    const callsAfterRelease = onCommit.mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onCommit.mock.calls.length).toBe(callsAfterRelease);
  });

  it('has a live region on the time display', () => {
    const tree = renderSheet();
    const liveText = tree.root.findAll(
      (node) =>
        node.type === 'Text' && node.props.accessibilityLiveRegion === 'polite',
    );
    expect(liveText.length).toBeGreaterThanOrEqual(1);
  });
});

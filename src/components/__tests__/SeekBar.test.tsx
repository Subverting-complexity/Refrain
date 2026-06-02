import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { SeekBar } from '../SeekBar';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        border: '#2a4a4e',
        surface: '#1a2e30',
        textSecondary: '#8ba89e',
      },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
      typography: {},
    },
  }),
}));

function renderSeekBar(
  props: Partial<React.ComponentProps<typeof SeekBar>> = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SeekBar
        positionMs={0}
        durationMs={10000}
        onSeek={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

function getAdjustable(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.type === 'View' && node.props.accessibilityRole === 'adjustable',
  )[0];
}

function getTouchArea(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.type === 'View' &&
      typeof node.props.onResponderGrant === 'function' &&
      typeof node.props.onLayout === 'function',
  )[0];
}

describe('SeekBar', () => {
  it('sets adjustable role and position label', () => {
    const tree = renderSeekBar({ positionMs: 5000, durationMs: 120000 });
    const container = getAdjustable(tree);
    expect(container).toBeDefined();
    expect(container.props.accessibilityLabel).toContain('0:05');
    expect(container.props.accessibilityLabel).toContain('2:00');
  });

  it('calls onSeek when the bar is tapped', () => {
    const onSeek = jest.fn();
    const tree = renderSeekBar({ durationMs: 10000, onSeek });
    const touchArea = getTouchArea(tree);

    act(() => {
      touchArea.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
    });
    act(() => {
      touchArea.props.onResponderGrant({ nativeEvent: { locationX: 150 } });
    });

    expect(onSeek).toHaveBeenCalledWith(5000);
  });

  it('accepts style prop override', () => {
    const tree = renderSeekBar({ style: { marginTop: 20 } });
    const container = getAdjustable(tree);
    const flatStyle = container.props.style;
    const hasMarginTop = flatStyle.some(
      (s: Record<string, unknown>) => s && s.marginTop === 20,
    );
    expect(hasMarginTop).toBe(true);
  });

  describe('accessibility actions', () => {
    it('exposes increment and decrement actions', () => {
      const tree = renderSeekBar();
      const container = getAdjustable(tree);
      expect(container.props.accessibilityActions).toEqual([
        { name: 'increment' },
        { name: 'decrement' },
      ]);
    });

    it('announces progress as a percentage via accessibilityValue', () => {
      const tree = renderSeekBar({ positionMs: 5000, durationMs: 20000 });
      const container = getAdjustable(tree);
      expect(container.props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 25,
      });
    });

    it('seeks forward 5s on increment', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({
        positionMs: 5000,
        durationMs: 20000,
        onSeek,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'increment' },
        });
      });
      expect(onSeek).toHaveBeenCalledWith(10000);
    });

    it('seeks back 5s on decrement', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({
        positionMs: 8000,
        durationMs: 20000,
        onSeek,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'decrement' },
        });
      });
      expect(onSeek).toHaveBeenCalledWith(3000);
    });

    it('clamps increment to duration', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({
        positionMs: 18000,
        durationMs: 20000,
        onSeek,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'increment' },
        });
      });
      expect(onSeek).toHaveBeenCalledWith(20000);
    });

    it('clamps decrement to zero', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({
        positionMs: 2000,
        durationMs: 20000,
        onSeek,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'decrement' },
        });
      });
      expect(onSeek).toHaveBeenCalledWith(0);
    });

    it('ignores actions when duration is zero', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ positionMs: 0, durationMs: 0, onSeek });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'increment' },
        });
      });
      expect(onSeek).not.toHaveBeenCalled();
    });
  });
});

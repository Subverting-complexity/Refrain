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

// Stub gesture-handler: GestureDetector renders its child and Gesture.Pan()
// records its callbacks so the test can drive begin/update/finalize with
// synthetic { x } events — the surface the native handler drives on a device.
jest.mock('react-native-gesture-handler', () => {
  let last: { handlers: Record<string, (e: unknown) => void> } | null = null;
  const makePan = () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const api = {
      runOnJS: () => api,
      minDistance: () => api,
      enabled: () => api,
      onBegin: (f: (e: unknown) => void) => {
        handlers.begin = f;
        return api;
      },
      onStart: (f: (e: unknown) => void) => {
        handlers.start = f;
        return api;
      },
      onUpdate: (f: (e: unknown) => void) => {
        handlers.update = f;
        return api;
      },
      onEnd: (f: (e: unknown) => void) => {
        handlers.end = f;
        return api;
      },
      onFinalize: (f: (e: unknown) => void) => {
        handlers.finalize = f;
        return api;
      },
    };
    last = { handlers };
    return api;
  };
  return {
    Gesture: { Pan: makePan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    __getHandlers: () => last?.handlers,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNGH = require('react-native-gesture-handler');
const handlers = () => RNGH.__getHandlers();

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
    (node) => node.type === 'View' && typeof node.props.onLayout === 'function',
  )[0];
}

function layout(tree: ReactTestRenderer, width = 300) {
  const touchArea = getTouchArea(tree);
  act(() => {
    touchArea.props.onLayout({ nativeEvent: { layout: { width } } });
  });
}

function begin(x: number) {
  act(() => handlers().begin({ x }));
}
function move(x: number) {
  act(() => handlers().update({ x }));
}
function finalize() {
  act(() => handlers().finalize({}));
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
    layout(tree);

    begin(150);

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

  describe('seek throttling during drag', () => {
    let nowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      nowSpy = jest.spyOn(Date, 'now');
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('throttles native seeks during rapid drag moves', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(0);
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenLastCalledWith(0);

      // Two moves within the 50ms throttle window: no extra native seeks.
      nowSpy.mockReturnValue(1010);
      move(30);
      nowSpy.mockReturnValue(1020);
      move(60);
      expect(onSeek).toHaveBeenCalledTimes(1);

      // A move past the throttle window fires one native seek.
      nowSpy.mockReturnValue(1100);
      move(90);
      expect(onSeek).toHaveBeenCalledTimes(2);
      expect(onSeek).toHaveBeenLastCalledWith(3000);
    });

    it('updates the visual every frame even while seeks are throttled', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(0);

      // Throttled move (within window) — no native seek but visual moves.
      nowSpy.mockReturnValue(1010);
      move(30);
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(10);
    });

    it('fires one final unthrottled seek on release', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(0);
      // Throttled move — the final position must still be committed on release.
      nowSpy.mockReturnValue(1010);
      move(75);
      expect(onSeek).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1020);
      finalize();
      expect(onSeek).toHaveBeenCalledTimes(2);
      expect(onSeek).toHaveBeenLastCalledWith(2500);
    });

    it('does not fire a redundant seek on release after a pure tap', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(150);
      finalize();

      // Tap already seeked on grant; release must not repeat the same seek.
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenCalledWith(5000);
    });

    it('does not re-fire on release when the final move already seeked', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(0);
      // Move past the throttle window so it seeks (3000), recording it.
      nowSpy.mockReturnValue(1100);
      move(90);
      expect(onSeek).toHaveBeenCalledTimes(2);

      nowSpy.mockReturnValue(1110);
      finalize();
      // Final position already committed by the move — no extra seek.
      expect(onSeek).toHaveBeenCalledTimes(2);
      expect(onSeek).toHaveBeenLastCalledWith(3000);
    });

    it('restores prop-driven visual after release', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({
        positionMs: 0,
        durationMs: 10000,
        onSeek,
      });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(150);
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(50);

      finalize();
      // dragRatio cleared → falls back to positionMs prop (0).
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(0);
    });

    it('clears the drag visual when the gesture finalizes', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({
        positionMs: 0,
        durationMs: 10000,
        onSeek,
      });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(300);
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(100);

      finalize();
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(0);
    });

    it('ignores drag when duration is zero', () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 0, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(150);
      finalize();
      expect(onSeek).not.toHaveBeenCalled();
    });
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

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { makeMutable, SharedValue } from 'react-native-reanimated';

import { SeekBar } from '../SeekBar';

jest.mock('../../hooks/useTheme');

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

/**
 * The playhead the bar was last rendered with. The component takes it as a
 * shared value rather than a number — the fill and the thumb follow it on the
 * UI thread — so the tests hand it one and write to this to move the engine.
 */
let playheadMs: SharedValue<number>;

function renderSeekBar({
  positionMs = 0,
  ...props
}: Partial<Omit<React.ComponentProps<typeof SeekBar>, 'playheadMs'>> & {
  positionMs?: number;
} = {}) {
  playheadMs = makeMutable(positionMs);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SeekBar
        playheadMs={playheadMs}
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

/**
 * Drive one gesture callback and let its `runOnJS` calls land.
 *
 * The handlers are worklets: they move the bar by writing shared values and
 * reach JavaScript only through `runOnJS`, which queues a microtask. Nothing
 * has reached `onSeek` until that queue has drained.
 */
async function fire(run: () => void): Promise<void> {
  await act(async () => {
    run();
  });
}

/**
 * Let the UI-thread projections reach React.
 *
 * The elapsed clock and the announced percentage are derived in the UI runtime
 * and mirrored back with `runOnJS`, so neither is on the first render. Under
 * Jest the UI runtime's reactions are driven from the frame loop, which runs on
 * real timers, so draining the microtask queue is not enough — anything
 * asserting one of those figures has to let a frame pass.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

const begin = (x: number) => fire(() => handlers().begin({ x }));
const move = (x: number) => fire(() => handlers().update({ x }));
const finalize = () => fire(() => handlers().finalize({}));

describe('SeekBar', () => {
  it('sets adjustable role and position label', async () => {
    const tree = renderSeekBar({ positionMs: 5000, durationMs: 120000 });
    await settle();
    const container = getAdjustable(tree);
    expect(container).toBeDefined();
    expect(container.props.accessibilityLabel).toContain('0:05');
    expect(container.props.accessibilityLabel).toContain('2:00');
  });

  it('calls onSeek when the bar is tapped', async () => {
    const onSeek = jest.fn();
    const tree = renderSeekBar({ durationMs: 10000, onSeek });
    layout(tree);

    await begin(150);

    expect(onSeek).toHaveBeenCalledWith(5000);
  });

  it('accepts style prop override', async () => {
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

    it('throttles native seeks during rapid drag moves', async () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(0);
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenLastCalledWith(0);

      // Two moves within the 50ms throttle window: no extra native seeks.
      nowSpy.mockReturnValue(1010);
      await move(30);
      nowSpy.mockReturnValue(1020);
      await move(60);
      expect(onSeek).toHaveBeenCalledTimes(1);

      // A move past the throttle window fires one native seek.
      nowSpy.mockReturnValue(1100);
      await move(90);
      expect(onSeek).toHaveBeenCalledTimes(2);
      expect(onSeek).toHaveBeenLastCalledWith(3000);
    });

    /**
     * The point of the whole rewrite. The fill follows the finger from a shared
     * value through an animated style, so a pointer event moves the bar without
     * rendering anything — and on Android there are up to a hundred and twenty
     * of those a second.
     *
     * Element identity is what can see it: a re-render would build fresh child
     * elements even where every value it computed was equal.
     */
    it('does not re-render while the finger moves', async () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(0);
      const afterBegin = getAdjustable(tree).props;

      nowSpy.mockReturnValue(1010);
      await move(30);
      nowSpy.mockReturnValue(1020);
      await move(60);
      nowSpy.mockReturnValue(1030);
      await move(90);

      expect(getAdjustable(tree).props).toBe(afterBegin);
      await finalize();
    });

    it('fires one final unthrottled seek on release', async () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(0);
      // Throttled move — the final position must still be committed on release.
      nowSpy.mockReturnValue(1010);
      await move(75);
      expect(onSeek).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1020);
      await finalize();
      expect(onSeek).toHaveBeenCalledTimes(2);
      expect(onSeek).toHaveBeenLastCalledWith(2500);
    });

    it('does not fire a redundant seek on release after a pure tap', async () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(150);
      await finalize();

      // Tap already seeked on grant; release must not repeat the same seek.
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenCalledWith(5000);
    });

    it('does not re-fire on release when the final move already seeked', async () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(0);
      // Move past the throttle window so it seeks (3000), recording it.
      nowSpy.mockReturnValue(1100);
      await move(90);
      expect(onSeek).toHaveBeenCalledTimes(2);

      nowSpy.mockReturnValue(1110);
      await finalize();
      // Final position already committed by the move — no extra seek.
      expect(onSeek).toHaveBeenCalledTimes(2);
      expect(onSeek).toHaveBeenLastCalledWith(3000);
    });

    /**
     * What the platform is told, as distinct from what is drawn. The announced
     * percentage follows the engine, not the finger: a screen reader drives
     * this bar with the increment and decrement actions rather than by
     * dragging, and re-announcing a value a hundred times a second would both
     * flood the reader and re-render the bar for every pointer event.
     */
    it('announces the engine position rather than the finger', async () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({
        positionMs: 0,
        durationMs: 10000,
        onSeek,
      });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(150);
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(0);

      await finalize();
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(0);
    });

    it('ignores drag when duration is zero', async () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({ durationMs: 0, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(150);
      await finalize();
      expect(onSeek).not.toHaveBeenCalled();
    });
  });

  describe('A/B region scoping', () => {
    it('reports position relative to the region in the label', async () => {
      const tree = renderSeekBar({
        positionMs: 8000,
        durationMs: 60000,
        rangeStartMs: 5000,
        rangeEndMs: 15000,
      });
      await settle();
      const container = getAdjustable(tree);
      // 8s is 3s into a 10s region.
      expect(container.props.accessibilityLabel).toContain('Loop position');
      expect(container.props.accessibilityLabel).toContain('0:03');
      expect(container.props.accessibilityLabel).toContain('0:10');
    });

    it('shows the playhead as progress through the region', async () => {
      const tree = renderSeekBar({
        positionMs: 10000,
        durationMs: 60000,
        rangeStartMs: 5000,
        rangeEndMs: 15000,
      });
      await settle();
      // 10s sits halfway through [5s, 15s].
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(50);
    });

    it('maps a tap to an absolute position inside the region', async () => {
      const onSeek = jest.fn();
      const tree = renderSeekBar({
        durationMs: 60000,
        rangeStartMs: 5000,
        rangeEndMs: 15000,
        onSeek,
      });
      layout(tree);

      // Tap at the bar midpoint → 5000 + 0.5 * 10000 = 10000ms.
      await begin(150);
      expect(onSeek).toHaveBeenCalledWith(10000);
    });

    it('ignores an inverted range and spans the whole track', async () => {
      const tree = renderSeekBar({
        positionMs: 30000,
        durationMs: 60000,
        rangeStartMs: 15000,
        rangeEndMs: 5000,
      });
      await settle();
      // Invalid range falls back to track-wide: 30s of 60s = 50%.
      const container = getAdjustable(tree);
      expect(container.props.accessibilityLabel).toContain('Playback position');
      expect(container.props.accessibilityValue.now).toBe(50);
    });
  });

  describe('accessibility actions', () => {
    it('exposes increment and decrement actions', async () => {
      const tree = renderSeekBar();
      const container = getAdjustable(tree);
      expect(container.props.accessibilityActions).toEqual([
        { name: 'increment' },
        { name: 'decrement' },
      ]);
    });

    it('announces progress as a percentage via accessibilityValue', async () => {
      const tree = renderSeekBar({ positionMs: 5000, durationMs: 20000 });
      await settle();
      const container = getAdjustable(tree);
      expect(container.props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 25,
      });
    });

    it('seeks forward 5s on increment', async () => {
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

    it('seeks back 5s on decrement', async () => {
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

    it('clamps increment to duration', async () => {
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

    it('clamps decrement to zero', async () => {
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

    it('ignores actions when duration is zero', async () => {
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

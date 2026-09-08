import React from 'react';
import { create, act } from 'react-test-renderer';

import { NO_DRAG, useSliderGesture } from '../useSliderGesture';

jest.mock('react-native-gesture-handler', () => {
  let last: { handlers: Record<string, (e: unknown) => void> } | null = null;
  const makePan = () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const api = {
      runOnJS: () => api,
      minDistance: () => api,
      onBegin: (f: (e: unknown) => void) => {
        handlers.begin = f;
        return api;
      },
      onUpdate: (f: (e: unknown) => void) => {
        handlers.update = f;
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
    __getHandlers: () => last?.handlers,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNGH = require('react-native-gesture-handler');
const handlers = () => RNGH.__getHandlers();

type HookResult = ReturnType<typeof useSliderGesture>;

let hookResult: HookResult;

function HookHost({
  onValueChange,
  enabled,
}: {
  onValueChange: (r: number) => void;
  enabled?: boolean;
}) {
  hookResult = useSliderGesture({ onValueChange, enabled });
  return null;
}

function renderHook(onValueChange: (r: number) => void, enabled?: boolean) {
  let tree!: import('react-test-renderer').ReactTestRenderer;
  act(() => {
    tree = create(React.createElement(HookHost, { onValueChange, enabled }));
  });
  const rerender = () =>
    act(() => {
      tree.update(React.createElement(HookHost, { onValueChange, enabled }));
    });
  return Object.assign(tree, { rerender });
}

/**
 * Drive one gesture callback and let the throttle's `runOnJS` land.
 *
 * A worklet does not call back into JavaScript directly: `runOnJS` queues a
 * microtask, which is what keeps the ordering guarantee the throttle relies on.
 * Nothing has reached `onValueChange` until that queue drains.
 */
async function fire(run: () => void): Promise<void> {
  await act(async () => {
    run();
  });
}

/** The live drag ratio, read off the shared value the hook exposes. */
function dragRatio(): number {
  return hookResult.dragRatio.value;
}

function setTrackWidth(width: number) {
  act(() => {
    hookResult.handleLayout({
      nativeEvent: { layout: { width } },
    } as import('react-native').LayoutChangeEvent);
  });
}

describe('useSliderGesture', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now');
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('returns a pan gesture and layout handler', () => {
    renderHook(jest.fn());
    expect(hookResult.pan).toBeDefined();
    expect(hookResult.handleLayout).toBeInstanceOf(Function);
    expect(dragRatio()).toBe(NO_DRAG);
    expect(hookResult.trackWidth.value).toBe(0);
  });

  it('builds the pan gesture once across re-renders', () => {
    // A Pan rebuilt while a finger is down drops the drag, so every input the
    // handlers need has to reach them through a shared value rather than a
    // closure. Cheap to break and invisible until someone drags.
    const { rerender } = renderHook(jest.fn());
    const first = hookResult.pan;

    rerender();
    rerender();

    expect(hookResult.pan).toBe(first);
  });

  it('fires onValueChange with the ratio on begin', async () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);
    setTrackWidth(200);

    nowSpy.mockReturnValue(1000);
    await fire(() => handlers().begin({ x: 100 }));

    expect(onValueChange).toHaveBeenCalledWith(0.5);
    expect(dragRatio()).toBe(0.5);
  });

  it('clamps ratio to 0..1', async () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);
    setTrackWidth(200);

    nowSpy.mockReturnValue(1000);
    await fire(() => handlers().begin({ x: 300 }));
    expect(onValueChange).toHaveBeenCalledWith(1);

    nowSpy.mockReturnValue(1100);
    await fire(() => handlers().finalize({}));

    nowSpy.mockReturnValue(1200);
    await fire(() => handlers().begin({ x: -50 }));
    expect(onValueChange).toHaveBeenLastCalledWith(0);
  });

  it('throttles move callbacks', async () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);
    setTrackWidth(100);

    nowSpy.mockReturnValue(1000);
    await fire(() => handlers().begin({ x: 0 }));
    expect(onValueChange).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1010);
    await fire(() => handlers().update({ x: 50 }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(dragRatio()).toBe(0.5);

    nowSpy.mockReturnValue(1100);
    await fire(() => handlers().update({ x: 80 }));
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenLastCalledWith(0.8);
  });

  it('commits final value on finalize', async () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);
    setTrackWidth(100);

    nowSpy.mockReturnValue(1000);
    await fire(() => handlers().begin({ x: 0 }));

    nowSpy.mockReturnValue(1010);
    await fire(() => handlers().update({ x: 75 }));

    nowSpy.mockReturnValue(1020);
    await fire(() => handlers().finalize({}));

    expect(onValueChange).toHaveBeenLastCalledWith(0.75);
    expect(dragRatio()).toBe(NO_DRAG);
  });

  it('does nothing when enabled is false', async () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange, false);
    setTrackWidth(200);

    nowSpy.mockReturnValue(1000);
    await fire(() => handlers().begin({ x: 100 }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(dragRatio()).toBe(NO_DRAG);
  });

  it('records the measured track width', () => {
    renderHook(jest.fn());
    setTrackWidth(240);
    expect(hookResult.trackWidth.value).toBe(240);
  });

  it('does nothing when track has zero width', async () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);

    nowSpy.mockReturnValue(1000);
    await fire(() => handlers().begin({ x: 100 }));

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

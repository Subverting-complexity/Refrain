import React from 'react';
import { create, act } from 'react-test-renderer';

import { useSliderGesture } from '../useSliderGesture';

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
  let tree: import('react-test-renderer').ReactTestRenderer;
  act(() => {
    tree = create(React.createElement(HookHost, { onValueChange, enabled }));
  });
  return tree!;
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
    expect(hookResult.dragRatio).toBeNull();
  });

  it('fires onValueChange with the ratio on begin', () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);
    setTrackWidth(200);

    nowSpy.mockReturnValue(1000);
    act(() => handlers().begin({ x: 100 }));

    expect(onValueChange).toHaveBeenCalledWith(0.5);
    expect(hookResult.dragRatio).toBe(0.5);
  });

  it('clamps ratio to 0..1', () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);
    setTrackWidth(200);

    nowSpy.mockReturnValue(1000);
    act(() => handlers().begin({ x: 300 }));
    expect(onValueChange).toHaveBeenCalledWith(1);

    nowSpy.mockReturnValue(1100);
    act(() => handlers().finalize({}));

    nowSpy.mockReturnValue(1200);
    act(() => handlers().begin({ x: -50 }));
    expect(onValueChange).toHaveBeenLastCalledWith(0);
  });

  it('throttles move callbacks', () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);
    setTrackWidth(100);

    nowSpy.mockReturnValue(1000);
    act(() => handlers().begin({ x: 0 }));
    expect(onValueChange).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1010);
    act(() => handlers().update({ x: 50 }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(hookResult.dragRatio).toBe(0.5);

    nowSpy.mockReturnValue(1100);
    act(() => handlers().update({ x: 80 }));
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenLastCalledWith(0.8);
  });

  it('commits final value on finalize', () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);
    setTrackWidth(100);

    nowSpy.mockReturnValue(1000);
    act(() => handlers().begin({ x: 0 }));

    nowSpy.mockReturnValue(1010);
    act(() => handlers().update({ x: 75 }));

    nowSpy.mockReturnValue(1020);
    act(() => handlers().finalize({}));

    expect(onValueChange).toHaveBeenLastCalledWith(0.75);
    expect(hookResult.dragRatio).toBeNull();
  });

  it('does nothing when enabled is false', () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange, false);
    setTrackWidth(200);

    nowSpy.mockReturnValue(1000);
    act(() => handlers().begin({ x: 100 }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(hookResult.dragRatio).toBeNull();
  });

  it('does nothing when track has zero width', () => {
    const onValueChange = jest.fn();
    renderHook(onValueChange);

    nowSpy.mockReturnValue(1000);
    act(() => handlers().begin({ x: 100 }));

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

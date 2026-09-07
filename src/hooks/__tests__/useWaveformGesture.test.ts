import React from 'react';
import { create, act } from 'react-test-renderer';

import { HORIZONTAL_PADDING } from '../../components/waveformLayout';
import {
  useWaveformGesture,
  UseWaveformGestureParams,
} from '../useWaveformGesture';

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

let hookResult: ReturnType<typeof useWaveformGesture>;

function HookHost(params: UseWaveformGestureParams) {
  hookResult = useWaveformGesture(params);
  return null;
}

const TRACK_WIDTH = 300;

function renderHook(overrides: Partial<UseWaveformGestureParams> = {}) {
  act(() => {
    create(
      React.createElement(HookHost, {
        durationMs: 10000,
        height: 180,
        placeMode: 'none',
        onSeek: jest.fn(),
        ...overrides,
      }),
    );
  });
  act(() => {
    hookResult.onLayout({
      nativeEvent: { layout: { width: TRACK_WIDTH + 2 * HORIZONTAL_PADDING } },
    } as never);
  });
}

const begin = (x: number, y = 0) => act(() => handlers().begin({ x, y }));
const move = (x: number) => act(() => handlers().update({ x }));
const finalize = () => act(() => handlers().finalize({}));

describe('useWaveformGesture', () => {
  /**
   * The reason `moveDrag` compares before it sets. A pan reports every pointer
   * event and positions round to whole milliseconds, so a held finger sends a
   * run of moves that all resolve to the same place. Each one used to allocate
   * a fresh drag object and re-render the whole waveform surface for a value
   * that had not changed.
   */
  it('keeps the same drag object when a move resolves to the same position', () => {
    renderHook();
    begin(HORIZONTAL_PADDING + 150);
    const afterBegin = hookResult.drag;

    move(HORIZONTAL_PADDING + 150);

    expect(hookResult.drag).toBe(afterBegin);
    finalize();
  });

  it('allocates a new drag object when the position actually moves', () => {
    renderHook();
    begin(HORIZONTAL_PADDING + 150);
    const afterBegin = hookResult.drag;

    move(HORIZONTAL_PADDING + 200);

    expect(hookResult.drag).not.toBe(afterBegin);
    expect(hookResult.drag?.ms).not.toBe(afterBegin?.ms);
    finalize();
  });

  it('drops the drag on release', () => {
    renderHook();
    begin(HORIZONTAL_PADDING + 150);
    finalize();

    expect(hookResult.drag).toBeNull();
  });
});

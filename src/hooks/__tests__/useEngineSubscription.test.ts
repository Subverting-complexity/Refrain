import { createElement } from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { useEngineSubscription } from '../useEngineSubscription';

function HookHost<T>({
  subscribe,
  initial,
  onState,
}: {
  subscribe: (cb: (s: T) => void) => () => void;
  initial: T;
  onState: (s: T) => void;
}) {
  const state = useEngineSubscription(subscribe, initial);
  onState(state);
  return null;
}

describe('useEngineSubscription', () => {
  it('returns initial state before subscription fires', () => {
    const subscribe = jest.fn(() => jest.fn());
    let captured: number | undefined;

    act(() => {
      create(
        createElement(HookHost, {
          subscribe,
          initial: 42,
          onState: (s: number) => {
            captured = s;
          },
        }),
      );
    });

    expect(captured).toBe(42);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('updates state when the subscription emits', () => {
    let listener: ((s: number) => void) | null = null;
    const subscribe = jest.fn((cb: (s: number) => void) => {
      listener = cb;
      return jest.fn();
    });

    let captured: number | undefined;
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(
        createElement(HookHost, {
          subscribe,
          initial: 0,
          onState: (s: number) => {
            captured = s;
          },
        }),
      );
    });

    expect(captured).toBe(0);

    act(() => {
      listener!(99);
    });

    expect(captured).toBe(99);
    act(() => {
      renderer?.unmount();
    });
  });

  /**
   * The audio engine publishes on every native status update — ten times a
   * second on a loaded track — and builds a fresh object each time. Without
   * this guard the whole player screen re-rendered at that rate for a
   * transport sitting still.
   */
  it('ignores a snapshot carrying the same values', () => {
    type State = { status: string; positionMs: number };
    let listener: ((s: State) => void) | null = null;
    const subscribe = jest.fn((cb: (s: State) => void) => {
      listener = cb;
      return jest.fn();
    });

    const onState = jest.fn();
    act(() => {
      create(
        createElement(HookHost, {
          subscribe,
          initial: { status: 'idle', positionMs: 0 },
          onState,
        }),
      );
    });
    const renders = onState.mock.calls.length;

    act(() => {
      listener!({ status: 'playing', positionMs: 100 });
    });
    expect(onState.mock.calls.length).toBe(renders + 1);

    // Same values, new object — the shape the engine actually pushes.
    act(() => {
      listener!({ status: 'playing', positionMs: 100 });
    });
    expect(onState.mock.calls.length).toBe(renders + 1);

    // A real change still gets through.
    act(() => {
      listener!({ status: 'playing', positionMs: 200 });
    });
    expect(onState.mock.calls.length).toBe(renders + 2);
  });

  it('sees a field added to an otherwise identical snapshot', () => {
    type State = { status: string; lastError?: string };
    let listener: ((s: State) => void) | null = null;
    const subscribe = jest.fn((cb: (s: State) => void) => {
      listener = cb;
      return jest.fn();
    });

    let captured: State | undefined;
    act(() => {
      create(
        createElement(HookHost, {
          subscribe,
          initial: { status: 'error' },
          onState: (s: State) => {
            captured = s;
          },
        }),
      );
    });

    act(() => {
      listener!({ status: 'error', lastError: 'no such file' });
    });

    expect(captured?.lastError).toBe('no such file');
  });

  it('calls the unsubscribe function on unmount', () => {
    const unsubscribe = jest.fn();
    const subscribe = jest.fn(() => unsubscribe);

    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(
        createElement(HookHost, {
          subscribe,
          initial: 0,
          onState: () => {},
        }),
      );
    });

    expect(unsubscribe).not.toHaveBeenCalled();

    act(() => {
      renderer?.unmount();
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

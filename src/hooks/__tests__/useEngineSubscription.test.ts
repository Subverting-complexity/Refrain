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
    renderer?.unmount();
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

import { createElement, useCallback } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeMutable, SharedValue } from 'react-native-reanimated';

import { useUiDerivedNumber } from '../useUiDerivedNumber';

let renders = 0;
let value = -1;

/**
 * Let the UI runtime run its reactions and the result reach React. They are
 * driven from the frame loop, which under Jest runs on real timers, so
 * draining the microtask queue is not enough.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

/** A component that shows whole seconds of a millisecond shared value. */
function Seconds({ ms }: { ms: SharedValue<number> }) {
  renders += 1;
  const derive = useCallback(() => {
    'worklet';
    return Math.floor(ms.value / 1000);
  }, [ms]);
  value = useUiDerivedNumber(derive, 0);
  return null;
}

function render(initialMs: number) {
  renders = 0;
  value = -1;
  const ms = makeMutable(initialMs);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(Seconds, { ms }));
  });
  return { ms, unmount: () => act(() => tree.unmount()) };
}

describe('useUiDerivedNumber', () => {
  let current: ReturnType<typeof render> | null = null;

  afterEach(async () => {
    const rendered = current;
    current = null;
    if (!rendered) return;
    await settle();
    rendered.unmount();
  });

  it('reports the projection of the shared value', async () => {
    current = render(4200);

    await settle();

    expect(value).toBe(4);
  });

  it('crosses back when the projection changes', async () => {
    current = render(4200);
    await settle();

    current.ms.value = 5100;
    await settle();

    expect(value).toBe(5);
  });

  it('does not re-render for a movement the projection cannot see', async () => {
    current = render(4200);
    await settle();
    const before = renders;

    // A third of a second of a track: the shared value moved, the second it
    // reads did not, and nothing crossed the thread boundary for it.
    current.ms.value = 4500;
    await settle();
    current.ms.value = 4900;
    await settle();

    expect(value).toBe(4);
    expect(renders).toBe(before);
  });

  it('delivers a first value that matches the caller’s initial guess', async () => {
    // The reaction's first run has no previous value to compare against, so it
    // is let through unconditionally — otherwise a projection that is right
    // from the start and never moves again would never arrive at all.
    current = render(0);

    await settle();

    expect(value).toBe(0);
  });
});

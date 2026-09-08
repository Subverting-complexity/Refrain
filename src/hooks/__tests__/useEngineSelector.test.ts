import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useEngineSelector } from '../useEngineSelector';

interface Snapshot {
  status: string;
  positionMs: number;
}

/** A stand-in engine: one current snapshot, published to listeners. */
function fakeEngine(initial: Snapshot) {
  let state = initial;
  const listeners = new Set<(next: Snapshot) => void>();
  return {
    getState: (): Snapshot => state,
    subscribe: (onChange: (next: Snapshot) => void): (() => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    publish(next: Snapshot): void {
      state = next;
      for (const listener of listeners) listener(next);
    },
    listenerCount: (): number => listeners.size,
  };
}

const selectStatus = (state: Snapshot): string => state.status;

interface Projection {
  status: string;
}
const selectProjection = (state: Snapshot): Projection => ({
  status: state.status,
});
const sameProjection = (a: Projection, b: Projection): boolean =>
  a.status === b.status;

let renders = 0;
let selected: unknown;

function render<S>(
  engine: ReturnType<typeof fakeEngine>,
  select: (state: Snapshot) => S,
  isEqual?: (a: S, b: S) => boolean,
) {
  renders = 0;
  function TestComponent() {
    renders += 1;
    selected = useEngineSelector(
      engine.subscribe,
      engine.getState,
      select,
      isEqual,
    );
    return null;
  }
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent));
  });
  return {
    publish: (next: Snapshot) => act(() => engine.publish(next)),
    unmount: () => act(() => tree.unmount()),
  };
}

describe('useEngineSelector', () => {
  it('returns the projection of the current snapshot', () => {
    render(fakeEngine({ status: 'paused', positionMs: 0 }), selectStatus);

    expect(selected).toBe('paused');
  });

  it('re-renders when the projection changes', () => {
    const engine = fakeEngine({ status: 'paused', positionMs: 0 });
    const { publish } = render(engine, selectStatus);
    const before = renders;

    publish({ status: 'playing', positionMs: 0 });

    expect(selected).toBe('playing');
    expect(renders).toBeGreaterThan(before);
  });

  it('does not re-render for a change outside the projection', () => {
    const engine = fakeEngine({ status: 'paused', positionMs: 0 });
    const { publish } = render(engine, selectStatus);
    const before = renders;

    publish({ status: 'paused', positionMs: 1000 });
    publish({ status: 'paused', positionMs: 2000 });

    // The whole point: the playhead moved twice and the status did not, so the
    // component that only reads the status stayed put.
    expect(renders).toBe(before);
  });

  it('holds the previous reference when a derived projection is equivalent', () => {
    const engine = fakeEngine({ status: 'paused', positionMs: 0 });
    const { publish } = render(engine, selectProjection, sameProjection);
    const first = selected;
    const before = renders;

    publish({ status: 'paused', positionMs: 5000 });

    // A selector that builds a fresh object would otherwise report a change
    // every time, which is what the equality function is for.
    expect(selected).toBe(first);
    expect(renders).toBe(before);
  });

  it('renders again once a derived projection genuinely differs', () => {
    const engine = fakeEngine({ status: 'paused', positionMs: 0 });
    const { publish } = render(engine, selectProjection, sameProjection);

    publish({ status: 'playing', positionMs: 0 });

    expect(selected).toEqual({ status: 'playing' });
  });

  it('unsubscribes on unmount', () => {
    const engine = fakeEngine({ status: 'paused', positionMs: 0 });
    const { unmount } = render(engine, selectStatus);
    expect(engine.listenerCount()).toBe(1);

    unmount();

    expect(engine.listenerCount()).toBe(0);
  });
});

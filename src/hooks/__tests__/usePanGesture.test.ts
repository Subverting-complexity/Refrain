import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { usePanGesture } from '../usePanGesture';

jest.mock('react-native-gesture-handler', () => {
  let last: {
    handlers: Record<string, (e: unknown) => void>;
    settings: string[];
  } | null = null;
  const makePan = () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const settings: string[] = [];
    const api = {
      runOnJS: (on: boolean) => {
        settings.push(`runOnJS:${on}`);
        return api;
      },
      minDistance: (d: number) => {
        settings.push(`minDistance:${d}`);
        return api;
      },
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
    last = { handlers, settings };
    return api;
  };
  return {
    Gesture: { Pan: makePan },
    __getLast: () => last,
    __reset: () => {
      last = null;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNGH = require('react-native-gesture-handler');
const last = () => RNGH.__getLast();

interface Calls {
  begin: [number, number][];
  update: [number, number][];
  finalize: number;
}

function renderHook(calls: Calls) {
  let gesture: ReturnType<typeof usePanGesture>;
  let renders = 0;
  function TestComponent() {
    renders += 1;
    gesture = usePanGesture({
      onBegin: (x, y) => calls.begin.push([x, y]),
      onUpdate: (x, y) => calls.update.push([x, y]),
      onFinalize: () => {
        calls.finalize += 1;
      },
    });
    return null;
  }
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent));
  });
  return {
    tree,
    rerender: () => act(() => tree.update(createElement(TestComponent))),
    // Assigned during the render above, which `act` has already flushed.
    gesture: () => gesture as ReturnType<typeof usePanGesture>,
    renderCount: () => renders,
  };
}

function emptyCalls(): Calls {
  return { begin: [], update: [], finalize: 0 };
}

describe('usePanGesture', () => {
  beforeEach(() => {
    RNGH.__reset();
  });

  // Asserted individually rather than as an ordered list: which order the
  // builder is called in is implementation, the values are the contract.
  it('claims the touch the instant a finger lands', () => {
    renderHook(emptyCalls());
    expect(last().settings).toContain('minDistance:0');
  });

  it('runs its callbacks on the JS thread', () => {
    renderHook(emptyCalls());
    expect(last().settings).toContain('runOnJS:true');
  });

  it('forwards both coordinates to onBegin and onUpdate', () => {
    const calls = emptyCalls();
    renderHook(calls);

    act(() => last().handlers.begin({ x: 12, y: 34 }));
    act(() => last().handlers.update({ x: 56, y: 78 }));
    act(() => last().handlers.finalize());

    expect(calls.begin).toEqual([[12, 34]]);
    expect(calls.update).toEqual([[56, 78]]);
    expect(calls.finalize).toBe(1);
  });

  it('builds the gesture once, however many times the caller re-renders', () => {
    const { gesture, rerender, renderCount } = renderHook(emptyCalls());
    const first = gesture();

    rerender();
    rerender();

    expect(renderCount()).toBeGreaterThan(1);
    expect(gesture()).toBe(first);
  });

  it('calls the newest callbacks after a re-render, not the ones it was built with', () => {
    // The whole point of the latest-ref plumbing: the gesture object is
    // frozen at mount, but a drag that starts later must still reach the
    // handlers from the most recent render.
    const first = emptyCalls();
    const second = emptyCalls();
    let calls = first;

    function TestComponent() {
      usePanGesture({
        onBegin: (x, y) => calls.begin.push([x, y]),
        onUpdate: (x, y) => calls.update.push([x, y]),
        onFinalize: () => {
          calls.finalize += 1;
        },
      });
      return null;
    }

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(createElement(TestComponent));
    });

    calls = second;
    act(() => tree.update(createElement(TestComponent)));
    act(() => last().handlers.begin({ x: 1, y: 2 }));

    expect(first.begin).toEqual([]);
    expect(second.begin).toEqual([[1, 2]]);
  });
});

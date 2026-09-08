import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { usePanGesture } from '../usePanGesture';

jest.mock('react-native-gesture-handler', () => {
  let last: {
    handlers: Record<string, (e: unknown) => void>;
    settings: string[];
  } | null = null;
  let built = 0;
  const makePan = () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const settings: string[] = [];
    built += 1;
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
    __buildCount: () => built,
    __reset: () => {
      last = null;
      built = 0;
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

function emptyCalls(): Calls {
  return { begin: [], update: [], finalize: 0 };
}

/**
 * Callbacks with a stable identity, which is what the hook asks of its callers:
 * the real ones are worklets that close over shared values, and shared values
 * never change identity. Built once per `Calls` object and reused across
 * renders, so a re-render hands the hook the same three functions.
 */
function stableHandlers(calls: Calls) {
  return {
    onBegin: (x: number, y: number) => {
      calls.begin.push([x, y]);
    },
    onUpdate: (x: number, y: number) => {
      calls.update.push([x, y]);
    },
    onFinalize: () => {
      calls.finalize += 1;
    },
  };
}

function renderHook(handlers: ReturnType<typeof stableHandlers>) {
  let gesture: ReturnType<typeof usePanGesture>;
  let renders = 0;
  function TestComponent() {
    renders += 1;
    gesture = usePanGesture(handlers);
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

describe('usePanGesture', () => {
  beforeEach(() => {
    RNGH.__reset();
  });

  // Asserted individually rather than as an ordered list: which order the
  // builder is called in is implementation, the values are the contract.
  it('claims the touch the instant a finger lands', () => {
    renderHook(stableHandlers(emptyCalls()));
    expect(last().settings).toContain('minDistance:0');
  });

  it('leaves the handlers on the UI thread', () => {
    renderHook(stableHandlers(emptyCalls()));

    // `runOnJS(true)` would route every pointer event through JavaScript, which
    // is the arrangement this hook exists to get rid of. Asserted by absence
    // because there is no positive signal: staying on the UI thread is the
    // default, and it is switching it off that has to be visible in a diff.
    expect(last().settings).not.toContain('runOnJS:true');
    expect(last().settings).not.toContain('runOnJS:false');
  });

  it('forwards both coordinates to onBegin and onUpdate', () => {
    const calls = emptyCalls();
    renderHook(stableHandlers(calls));

    act(() => last().handlers.begin({ x: 12, y: 34 }));
    act(() => last().handlers.update({ x: 56, y: 78 }));
    act(() => last().handlers.finalize());

    expect(calls.begin).toEqual([[12, 34]]);
    expect(calls.update).toEqual([[56, 78]]);
    expect(calls.finalize).toBe(1);
  });

  it('builds the gesture once while its handlers keep their identity', () => {
    const { gesture, rerender, renderCount } = renderHook(
      stableHandlers(emptyCalls()),
    );
    const first = gesture();

    rerender();
    rerender();

    expect(renderCount()).toBeGreaterThan(1);
    expect(gesture()).toBe(first);
    expect(RNGH.__buildCount()).toBe(1);
  });

  it('rebuilds the gesture when a handler changes identity', () => {
    // The other half of the contract, stated so it cannot be broken silently:
    // there is no latest-ref indirection any more, so a caller that hands over
    // a fresh closure each render gets a fresh gesture — and a gesture replaced
    // mid-drag drops the drag. Every caller keeps what varies in shared values
    // for exactly this reason.
    let gesture: ReturnType<typeof usePanGesture>;
    function TestComponent() {
      gesture = usePanGesture(stableHandlers(emptyCalls()));
      return null;
    }

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(createElement(TestComponent));
    });
    const first = gesture!;

    act(() => tree.update(createElement(TestComponent)));

    expect(gesture!).not.toBe(first);
  });
});

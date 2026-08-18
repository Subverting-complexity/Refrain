import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { usePersistedSetting } from '../usePersistedSetting';

const mockHydrateSettings = jest.fn<Promise<void>, []>();

jest.mock('../../services/settingsStore', () => ({
  hydrateSettings: () => mockHydrateSettings(),
}));

let lastResult: [unknown, (value: never) => void];

function TestComponent(props: {
  read: () => unknown;
  write: (value: unknown) => void;
  fallback: unknown;
}) {
  lastResult = usePersistedSetting(props);
  return null;
}

// Async act so the post-hydration re-read effect (a resolved-promise
// microtask) flushes before assertions.
async function renderHook(props: {
  read: () => unknown;
  write?: (value: unknown) => void;
  fallback: unknown;
}): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(TestComponent, { write: jest.fn(), ...props }));
  });
  return tree;
}

const value = () => lastResult[0];
const setValue = (next: unknown) =>
  (lastResult[1] as (v: unknown) => void)(next);

beforeEach(() => {
  jest.clearAllMocks();
  mockHydrateSettings.mockResolvedValue(undefined);
});

describe('usePersistedSetting', () => {
  it('seeds synchronously from storage', async () => {
    await renderHook({ read: () => 30, fallback: 5 });
    expect(value()).toBe(30);
  });

  it('falls back when the seed read throws', async () => {
    await renderHook({
      read: () => {
        throw new Error('db unavailable');
      },
      fallback: 5,
    });
    expect(value()).toBe(5);
  });

  it('persists and updates state when set', async () => {
    const write = jest.fn();
    await renderHook({ read: () => 5, write, fallback: 5 });

    act(() => setValue(15));

    expect(value()).toBe(15);
    expect(write).toHaveBeenCalledWith(15);
  });

  it('keeps the new state when the write throws', async () => {
    const write = jest.fn(() => {
      throw new Error('write failed');
    });
    await renderHook({ read: () => 5, write, fallback: 5 });

    // Regression for #186: an unguarded storage throw escapes into the press
    // handler that called the setter.
    expect(() => act(() => setValue(10))).not.toThrow();
    expect(value()).toBe(10);
  });

  // Regression for the #163 class of bug: on a cold web load the settings
  // cache is still filling from IndexedDB when the lazy seed runs, so the
  // stored value reads as the fallback. Once hydration resolves the hook must
  // re-read and reapply the persisted value.
  it('reapplies a persisted value the cold-load seed missed', async () => {
    const read = jest
      .fn()
      .mockReturnValueOnce(5) // seed: cache still empty
      .mockReturnValue(30); // post-hydration: real persisted value

    await renderHook({ read, fallback: 5 });

    expect(mockHydrateSettings).toHaveBeenCalledTimes(1);
    expect(value()).toBe(30);
  });

  it('keeps the seed when hydration rejects', async () => {
    mockHydrateSettings.mockRejectedValue(new Error('idb unavailable'));
    await renderHook({ read: () => 15, fallback: 5 });
    expect(value()).toBe(15);
  });

  it('keeps the seed when hydration throws synchronously', async () => {
    mockHydrateSettings.mockImplementation(() => {
      throw new Error('idb unavailable');
    });
    await renderHook({ read: () => 15, fallback: 5 });
    expect(value()).toBe(15);
  });

  // A failed post-hydration read has nothing to correct the seed *with*.
  // Replacing a good seed with the fallback would be the very clobber the
  // cold-load re-read exists to prevent.
  it('keeps a good seed when the post-hydration read throws', async () => {
    const read = jest
      .fn()
      .mockReturnValueOnce(15)
      .mockImplementation(() => {
        throw new Error('db went away');
      });

    await renderHook({ read, fallback: 5 });

    expect(value()).toBe(15);
  });

  // `false` is a legitimate stored value, so the "did the read succeed?"
  // signal cannot be a falsy/null sentinel.
  it('applies a falsy persisted value rather than treating it as missing', async () => {
    const read = jest
      .fn()
      .mockReturnValueOnce(true) // seed: cache still empty, reads as default-on
      .mockReturnValue(false); // post-hydration: persisted off

    await renderHook({ read, fallback: true });

    expect(value()).toBe(false);
  });

  it('does not re-read after unmount', async () => {
    let resolveHydration!: () => void;
    mockHydrateSettings.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveHydration = resolve;
      }),
    );
    const read = jest.fn().mockReturnValue(5);

    const tree = await renderHook({ read, fallback: 5 });
    read.mockClear();

    // Unmount first so the effect cleanup has committed before hydration
    // resolves — the real-world order, where a screen is left mid-hydration.
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      resolveHydration();
    });

    expect(read).not.toHaveBeenCalled();
  });
});

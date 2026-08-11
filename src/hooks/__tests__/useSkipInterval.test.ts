import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SKIP_PRESETS, useSkipInterval } from '../useSkipInterval';

const mockGetNumber = jest.fn<number, [string, number]>();
const mockSetNumber = jest.fn<void, [string, number]>();
const mockHydrateSettings = jest.fn<Promise<void>, []>();

jest.mock('../../services/settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
  hydrateSettings: () => mockHydrateSettings(),
}));

let lastResult: ReturnType<typeof useSkipInterval>;

function TestComponent() {
  lastResult = useSkipInterval();
  return null;
}

// Async act so the post-hydration re-read effect (a resolved-promise
// microtask) flushes before assertions.
async function renderTestHook(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(TestComponent));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNumber.mockImplementation((_key, fallback) => fallback);
  mockHydrateSettings.mockResolvedValue(undefined);
});

describe('useSkipInterval', () => {
  it('defaults to 5 seconds (5000ms)', async () => {
    await renderTestHook();
    expect(lastResult.skipSeconds).toBe(5);
    expect(lastResult.skipMs).toBe(5000);
  });

  it('hydrates a persisted preset on mount', async () => {
    mockGetNumber.mockReturnValue(10);
    await renderTestHook();
    expect(lastResult.skipSeconds).toBe(10);
    expect(lastResult.skipMs).toBe(10000);
  });

  it('falls back to the default for a non-preset stored value', async () => {
    mockGetNumber.mockReturnValue(7);
    await renderTestHook();
    expect(lastResult.skipSeconds).toBe(5);
  });

  it('persists and updates when a new amount is set', async () => {
    await renderTestHook();
    act(() => {
      lastResult.setSkipSeconds(15);
    });
    expect(lastResult.skipSeconds).toBe(15);
    expect(lastResult.skipMs).toBe(15000);
    expect(mockSetNumber).toHaveBeenCalledWith('playback.skipSeconds', 15);
  });

  it('falls back to the default when reading from storage throws', async () => {
    mockGetNumber.mockImplementation(() => {
      throw new Error('db unavailable');
    });
    await renderTestHook();
    expect(lastResult.skipSeconds).toBe(5);
  });

  it('does not throw when persisting fails', async () => {
    mockSetNumber.mockImplementation(() => {
      throw new Error('write failed');
    });
    await renderTestHook();
    expect(() => {
      act(() => {
        lastResult.setSkipSeconds(10);
      });
    }).not.toThrow();
    expect(lastResult.skipSeconds).toBe(10);
  });

  it('exposes the selectable presets', () => {
    expect(SKIP_PRESETS).toEqual([1, 3, 5, 10, 15, 30]);
  });

  // Regression for the #163 class of bug: on a cold web load the settings
  // cache is still hydrating from IndexedDB when the lazy seed runs, so the
  // stored amount reads as the default 5s. Once hydration resolves the hook
  // must re-read and reapply the persisted value, as the theme and
  // snippet-preview readers already do.
  it('reapplies a persisted amount the cold-load seed missed', async () => {
    mockGetNumber
      .mockImplementationOnce((_key, fallback) => fallback) // seed: cache empty
      .mockReturnValue(30); // post-hydration: real persisted value

    await renderTestHook();

    expect(mockHydrateSettings).toHaveBeenCalledTimes(1);
    expect(lastResult.skipSeconds).toBe(30);
    expect(lastResult.skipMs).toBe(30000);
  });

  it('keeps the seeded value when hydration rejects', async () => {
    mockGetNumber.mockReturnValue(15);
    mockHydrateSettings.mockRejectedValue(new Error('idb unavailable'));

    await renderTestHook();

    expect(lastResult.skipSeconds).toBe(15);
  });

  // The seed can succeed and the post-hydration re-read still fail (storage
  // goes away between the two). Falling back to the default there would
  // silently reset a user's 30s choice to 5s — the #163 clobber, arriving by
  // the other door.
  it('keeps a good seed when the post-hydration re-read throws', async () => {
    mockGetNumber.mockReturnValueOnce(30).mockImplementation(() => {
      throw new Error('db went away');
    });

    await renderTestHook();

    expect(lastResult.skipSeconds).toBe(30);
  });

  it('never puts an off-list amount into state', async () => {
    await renderTestHook();

    act(() => {
      lastResult.setSkipSeconds(7);
    });

    expect(lastResult.skipSeconds).toBe(5);
    expect(mockSetNumber).toHaveBeenCalledWith('playback.skipSeconds', 5);
  });
});

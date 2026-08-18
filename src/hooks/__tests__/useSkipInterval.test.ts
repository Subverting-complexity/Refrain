import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  describeSkip,
  SKIP_PRESETS,
  useSkipInterval,
} from '../useSkipInterval';

const mockGetNumber = jest.fn<number, [string, number]>();
const mockSetNumber = jest.fn<void, [string, number]>();
const mockGetSetting = jest.fn<string | null, [string]>();
const mockSetSetting = jest.fn<void, [string, string]>();
const mockHydrateSettings = jest.fn<Promise<void>, []>();

jest.mock('../../services/settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
  getSetting: (key: string) => mockGetSetting(key),
  setSetting: (key: string, value: string) => mockSetSetting(key, value),
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
  mockGetSetting.mockReturnValue(null);
  mockHydrateSettings.mockResolvedValue(undefined);
});

describe('useSkipInterval', () => {
  it('defaults to a 5 second interval', async () => {
    await renderTestHook();
    expect(lastResult.skipPreference).toEqual({
      mode: 'interval',
      seconds: 5,
    });
  });

  it('hydrates a persisted preset on mount', async () => {
    mockGetNumber.mockReturnValue(10);
    await renderTestHook();
    expect(lastResult.skipPreference.seconds).toBe(10);
  });

  it('hydrates a persisted full mode on mount', async () => {
    mockGetSetting.mockReturnValue('full');
    mockGetNumber.mockReturnValue(30);
    await renderTestHook();
    expect(lastResult.skipPreference).toEqual({ mode: 'full', seconds: 30 });
  });

  it('falls back to the default for a non-preset stored value', async () => {
    mockGetNumber.mockReturnValue(7);
    await renderTestHook();
    expect(lastResult.skipPreference.seconds).toBe(5);
  });

  it('persists and updates when a new amount is set', async () => {
    await renderTestHook();
    act(() => {
      lastResult.setSkipPreference({ mode: 'interval', seconds: 60 });
    });
    expect(lastResult.skipPreference).toEqual({
      mode: 'interval',
      seconds: 60,
    });
    expect(mockSetNumber).toHaveBeenCalledWith('playback.skipSeconds', 60);
    expect(mockSetSetting).toHaveBeenCalledWith(
      'playback.skipMode',
      'interval',
    );
  });

  it('persists a switch to full mode', async () => {
    await renderTestHook();
    act(() => {
      lastResult.setSkipPreference({ mode: 'full', seconds: 15 });
    });
    expect(lastResult.skipPreference.mode).toBe('full');
    expect(mockSetSetting).toHaveBeenCalledWith('playback.skipMode', 'full');
  });

  it('falls back to the default when reading from storage throws', async () => {
    mockGetNumber.mockImplementation(() => {
      throw new Error('db unavailable');
    });
    await renderTestHook();
    expect(lastResult.skipPreference.seconds).toBe(5);
  });

  it('does not throw when persisting fails', async () => {
    mockSetNumber.mockImplementation(() => {
      throw new Error('write failed');
    });
    await renderTestHook();
    expect(() => {
      act(() => {
        lastResult.setSkipPreference({ mode: 'interval', seconds: 10 });
      });
    }).not.toThrow();
    expect(lastResult.skipPreference.seconds).toBe(10);
  });

  it('exposes the selectable presets', () => {
    expect(SKIP_PRESETS).toEqual([1, 3, 5, 10, 15, 30, 60, 300]);
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
    expect(lastResult.skipPreference.seconds).toBe(30);
  });

  it('keeps the seeded value when hydration rejects', async () => {
    mockGetNumber.mockReturnValue(15);
    mockHydrateSettings.mockRejectedValue(new Error('idb unavailable'));

    await renderTestHook();

    expect(lastResult.skipPreference.seconds).toBe(15);
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

    expect(lastResult.skipPreference.seconds).toBe(30);
  });

  it('never puts an off-list amount or mode into state', async () => {
    await renderTestHook();

    act(() => {
      lastResult.setSkipPreference({
        mode: 'sideways',
        seconds: 7,
      } as unknown as Parameters<typeof lastResult.setSkipPreference>[0]);
    });

    expect(lastResult.skipPreference).toEqual({
      mode: 'interval',
      seconds: 5,
    });
  });

  describe('accessibility labels', () => {
    it('names the configured interval', async () => {
      mockGetNumber.mockReturnValue(300);
      await renderTestHook();
      expect(lastResult.skipBackLabel).toBe('Skip back 5m');
      expect(lastResult.skipForwardLabel).toBe('Skip forward 5m');
    });

    it('names the destination in full mode', async () => {
      mockGetSetting.mockReturnValue('full');
      await renderTestHook();
      expect(lastResult.skipBackLabel).toBe('Skip to start');
      expect(lastResult.skipForwardLabel).toBe('Skip to end');
    });

    it('tracks a live preference change', async () => {
      await renderTestHook();
      expect(lastResult.skipForwardLabel).toBe('Skip forward 5s');
      act(() => {
        lastResult.setSkipPreference({ mode: 'full', seconds: 5 });
      });
      expect(lastResult.skipForwardLabel).toBe('Skip to end');
    });
  });
});

describe('describeSkip', () => {
  it.each([
    ['back', 'interval', 60, 'Skip back 1m'],
    ['forward', 'interval', 60, 'Skip forward 1m'],
    ['back', 'full', 60, 'Skip to start'],
    ['forward', 'full', 60, 'Skip to end'],
  ])('describes %s in %s mode', (direction, mode, seconds, expected) => {
    expect(
      describeSkip(
        { mode, seconds } as Parameters<typeof describeSkip>[0],
        direction as 'back' | 'forward',
      ),
    ).toBe(expected);
  });
});

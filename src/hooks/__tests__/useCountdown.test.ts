import { createElement } from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { useCountdown } from '../useCountdown';
import { DEFAULT_COUNTDOWN_CONFIG } from '../../services/countdownStore';
import { CountdownConfig } from '../../types';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn().mockImplementation(() => ({
    play: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn(),
  })),
}));

// Stand in for the persistence layer so the hook's read-on-mount and
// write-on-change can be asserted without a working SQLite/IndexedDB behind
// it. The sanitizers stay real — the hook is supposed to route values through
// them, and a stubbed passthrough would hide it if it stopped.
//
// The two are backed by one variable rather than being independent stubs, so
// a read genuinely returns what a previous write stored. Stubbing the read
// with the expected answer would make the write inert and the "survives a
// remount" test below could not fail.
let mockStored: CountdownConfig;
const mockGetCountdownConfig = jest.fn<CountdownConfig, []>();
const mockSetCountdownConfig = jest.fn<void, [CountdownConfig]>();

jest.mock('../../services/countdownStore', () => ({
  ...jest.requireActual('../../services/countdownStore'),
  getCountdownConfig: () => mockGetCountdownConfig(),
  setCountdownConfig: (config: CountdownConfig) =>
    mockSetCountdownConfig(config),
}));

// `usePersistedSetting` awaits this before its post-mount re-read. Mocked so
// the hydration path is under the test's control rather than reaching the real
// native store (see `useSkipInterval.test.ts`, which does the same).
const mockHydrateSettings = jest.fn<Promise<void>, []>();

jest.mock('../../services/settingsStore', () => ({
  ...jest.requireActual('../../services/settingsStore'),
  hydrateSettings: () => mockHydrateSettings(),
}));

const STORED_CONFIG: CountdownConfig = {
  enabled: true,
  mode: 'metronome',
  duration: { type: 'seconds', seconds: 10 },
  repeat: 'everyLoop',
};

const mockPlay = jest.fn().mockResolvedValue(undefined);
let lastResult: ReturnType<typeof useCountdown>;

function TestComponent() {
  lastResult = useCountdown({ onPlay: mockPlay });
  return null;
}

// Async act so the post-hydration re-read effect (a resolved-promise
// microtask) flushes before assertions, as in `useSkipInterval.test.ts`.
// Rendering synchronously leaves that re-read to land after the test has
// asserted, which both hides the hydration path and logs an act warning.
async function renderTestHook(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(TestComponent));
  });
  return tree;
}

describe('useCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // `clearAllMocks` drops recorded calls but keeps implementations, so a
    // test that makes the writer throw would poison every test after it
    // (the same trap `skipIntervalStore.test.ts` documents). Reset both, then
    // rebuild the stateful store from empty.
    mockGetCountdownConfig.mockReset();
    mockSetCountdownConfig.mockReset();
    mockStored = DEFAULT_COUNTDOWN_CONFIG;
    mockGetCountdownConfig.mockImplementation(() => mockStored);
    mockSetCountdownConfig.mockImplementation((config) => {
      mockStored = config;
    });
    mockHydrateSettings.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns idle state initially', async () => {
    await renderTestHook();
    expect(lastResult.countdownState.phase).toBe('idle');
  });

  it('returns default config with countdown disabled', async () => {
    await renderTestHook();
    expect(lastResult.countdownConfig.enabled).toBe(false);
  });

  it('plays audio directly when countdown is disabled', async () => {
    await renderTestHook();

    await act(async () => {
      await lastResult.playWithCountdown();
    });

    expect(mockPlay).toHaveBeenCalled();
  });

  it('starts countdown when enabled and play is called', async () => {
    await renderTestHook();

    const config: CountdownConfig = {
      enabled: true,
      mode: 'silent',
      duration: { type: 'bars', bars: 1 },
      repeat: 'once',
    };

    act(() => {
      lastResult.setCountdownConfig(config);
    });

    await act(async () => {
      await lastResult.playWithCountdown();
    });

    expect(lastResult.countdownState.phase).toBe('counting');
  });

  it('calls audioEngine.play after countdown completes', async () => {
    await renderTestHook();

    act(() => {
      lastResult.setCountdownConfig({
        enabled: true,
        mode: 'silent',
        duration: { type: 'bars', bars: 1 },
        repeat: 'once',
      });
    });

    await act(async () => {
      await lastResult.playWithCountdown();
    });

    // 1 bar = 4 one-second ticks.
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockPlay).toHaveBeenCalled();
  });

  it('cancels countdown', async () => {
    await renderTestHook();

    act(() => {
      lastResult.setCountdownConfig({
        enabled: true,
        mode: 'silent',
        duration: { type: 'bars', bars: 1 },
        repeat: 'once',
      });
    });

    await act(async () => {
      await lastResult.playWithCountdown();
    });

    act(() => {
      lastResult.cancelCountdown();
    });

    expect(lastResult.countdownState.phase).toBe('idle');
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('updates config', async () => {
    await renderTestHook();

    act(() => {
      lastResult.setCountdownConfig({
        enabled: true,
        mode: 'metronome',
        duration: { type: 'seconds', seconds: 5 },
        repeat: 'once',
      });
    });

    expect(lastResult.countdownConfig).toEqual({
      enabled: true,
      mode: 'metronome',
      duration: { type: 'seconds', seconds: 5 },
      repeat: 'once',
    });
  });

  // The count-in used to live in component state, so leaving the player
  // screen dropped it and every return started from "off" again.
  describe('persistence', () => {
    it('seeds from the stored config on mount', async () => {
      mockStored = STORED_CONFIG;

      await renderTestHook();

      expect(lastResult.countdownConfig).toEqual(STORED_CONFIG);
    });

    it('persists a config change', async () => {
      await renderTestHook();

      act(() => {
        lastResult.setCountdownConfig(STORED_CONFIG);
      });

      expect(mockSetCountdownConfig).toHaveBeenCalledWith(STORED_CONFIG);
    });

    // The regression from #262, end to end: configure the count-in on one
    // mount of the player, leave, come back, and find it still set. Nothing
    // here hands the second mount the answer — it reads what the first one
    // wrote, so removing the write below makes this fail.
    it('keeps the configured count-in across a remount of the player screen', async () => {
      const first = await renderTestHook();

      act(() => {
        lastResult.setCountdownConfig(STORED_CONFIG);
      });

      // Leaving the player unmounts the screen; coming back mounts a fresh
      // one, which has no memory of the previous component's state.
      act(() => {
        first.unmount();
      });
      await renderTestHook();

      expect(lastResult.countdownConfig).toEqual(STORED_CONFIG);
    });

    it('reapplies the stored config once hydration resolves', async () => {
      // The web cold-load path (#163): the synchronous seed runs while the
      // settings cache is still filling, so it reads the default, and only
      // the post-hydration re-read produces the stored value. Modelled by
      // leaving the store empty until hydration is awaited.
      let hydrated = false;
      mockGetCountdownConfig.mockImplementation(() =>
        hydrated ? STORED_CONFIG : DEFAULT_COUNTDOWN_CONFIG,
      );
      mockHydrateSettings.mockImplementation(async () => {
        hydrated = true;
      });

      await renderTestHook();

      expect(lastResult.countdownConfig).toEqual(STORED_CONFIG);
    });

    it('snaps an off-list length before it reaches state or storage', async () => {
      await renderTestHook();

      act(() => {
        lastResult.setCountdownConfig({
          ...DEFAULT_COUNTDOWN_CONFIG,
          duration: { type: 'seconds', seconds: 7 },
        });
      });

      const expected = {
        ...DEFAULT_COUNTDOWN_CONFIG,
        duration: { type: 'seconds', seconds: 3 },
      };
      expect(lastResult.countdownConfig).toEqual(expected);
      expect(mockSetCountdownConfig).toHaveBeenCalledWith(expected);
    });

    it('falls back to the default when the stored config cannot be read', async () => {
      mockGetCountdownConfig.mockImplementation(() => {
        throw new Error('storage unavailable');
      });

      await renderTestHook();

      expect(lastResult.countdownConfig).toEqual(DEFAULT_COUNTDOWN_CONFIG);
    });

    it('keeps working when the write fails', async () => {
      mockSetCountdownConfig.mockImplementation(() => {
        throw new Error('storage unavailable');
      });

      await renderTestHook();

      expect(() =>
        act(() => {
          lastResult.setCountdownConfig(STORED_CONFIG);
        }),
      ).not.toThrow();
      expect(lastResult.countdownConfig).toEqual(STORED_CONFIG);
    });
  });
});

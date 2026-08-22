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
const mockGetCountdownConfig = jest.fn<CountdownConfig, []>();
const mockSetCountdownConfig = jest.fn<void, [CountdownConfig]>();

jest.mock('../../services/countdownStore', () => ({
  ...jest.requireActual('../../services/countdownStore'),
  getCountdownConfig: () => mockGetCountdownConfig(),
  setCountdownConfig: (config: CountdownConfig) =>
    mockSetCountdownConfig(config),
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

function renderTestHook(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent));
  });
  return tree;
}

describe('useCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // Nothing stored unless a test says otherwise.
    mockGetCountdownConfig.mockReturnValue(DEFAULT_COUNTDOWN_CONFIG);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns idle state initially', () => {
    renderTestHook();
    expect(lastResult.countdownState.phase).toBe('idle');
  });

  it('returns default config with countdown disabled', () => {
    renderTestHook();
    expect(lastResult.countdownConfig.enabled).toBe(false);
  });

  it('plays audio directly when countdown is disabled', async () => {
    renderTestHook();

    await act(async () => {
      await lastResult.playWithCountdown();
    });

    expect(mockPlay).toHaveBeenCalled();
  });

  it('starts countdown when enabled and play is called', async () => {
    renderTestHook();

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
    renderTestHook();

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
    renderTestHook();

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

  it('updates config', () => {
    renderTestHook();

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
    it('seeds from the stored config on mount', () => {
      mockGetCountdownConfig.mockReturnValue(STORED_CONFIG);

      renderTestHook();

      expect(lastResult.countdownConfig).toEqual(STORED_CONFIG);
    });

    it('persists a config change', () => {
      renderTestHook();

      act(() => {
        lastResult.setCountdownConfig(STORED_CONFIG);
      });

      expect(mockSetCountdownConfig).toHaveBeenCalledWith(STORED_CONFIG);
    });

    it('keeps the configured count-in across a remount of the player screen', () => {
      renderTestHook();

      act(() => {
        lastResult.setCountdownConfig(STORED_CONFIG);
      });

      // Leaving the player unmounts the screen; coming back mounts a fresh
      // one, which reads the store rather than the previous component.
      mockGetCountdownConfig.mockReturnValue(STORED_CONFIG);
      renderTestHook();

      expect(lastResult.countdownConfig).toEqual(STORED_CONFIG);
    });

    it('snaps an off-list length before it reaches state or storage', () => {
      renderTestHook();

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

    it('falls back to the default when the stored config cannot be read', () => {
      mockGetCountdownConfig.mockImplementation(() => {
        throw new Error('storage unavailable');
      });

      renderTestHook();

      expect(lastResult.countdownConfig).toEqual(DEFAULT_COUNTDOWN_CONFIG);
    });

    it('keeps working when the write fails', () => {
      mockSetCountdownConfig.mockImplementation(() => {
        throw new Error('storage unavailable');
      });

      renderTestHook();

      expect(() =>
        act(() => {
          lastResult.setCountdownConfig(STORED_CONFIG);
        }),
      ).not.toThrow();
      expect(lastResult.countdownConfig).toEqual(STORED_CONFIG);
    });
  });
});

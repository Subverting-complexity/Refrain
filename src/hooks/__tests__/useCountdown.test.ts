import { createElement } from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: {
          playAsync: jest.fn().mockResolvedValue({}),
          setPositionAsync: jest.fn().mockResolvedValue({}),
          unloadAsync: jest.fn().mockResolvedValue({}),
        },
      }),
    },
  },
}));

const mockPlay = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/audioEngine', () => ({
  play: (...args: unknown[]) => mockPlay(...args),
  pause: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  seekTo: jest.fn().mockResolvedValue(undefined),
  loadTrack: jest.fn().mockResolvedValue(undefined),
  unloadTrack: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockReturnValue(jest.fn()),
  getState: jest.fn().mockReturnValue({
    status: 'idle',
    positionMs: 0,
    durationMs: 0,
    markerA: null,
    markerB: null,
  }),
}));

import { useCountdown } from '../useCountdown';
import { CountdownConfig } from '../../types';

let lastResult: ReturnType<typeof useCountdown>;

function TestComponent() {
  lastResult = useCountdown();
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
      bpm: 120,
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
        bpm: 120,
      });
    });

    await act(async () => {
      await lastResult.playWithCountdown();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
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
        bpm: 120,
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
        bpm: 100,
      });
    });

    expect(lastResult.countdownConfig).toEqual({
      enabled: true,
      mode: 'metronome',
      duration: { type: 'seconds', seconds: 5 },
      bpm: 100,
    });
  });
});

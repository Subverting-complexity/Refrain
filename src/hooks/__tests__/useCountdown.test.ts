import { createElement } from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { useCountdown } from '../useCountdown';
import { CountdownConfig } from '../../types';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn().mockImplementation(() => ({
    play: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn(),
  })),
}));

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
});

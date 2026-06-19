import { CountdownConfig, CountdownState } from '../../types';

import * as countdownEngine from '../countdownEngine';

const mockPlay = jest.fn();
const mockSeekTo = jest.fn().mockResolvedValue(undefined);
const mockRemove = jest.fn();
const mockCreateAudioPlayer = jest.fn().mockImplementation(() => ({
  play: mockPlay,
  seekTo: mockSeekTo,
  remove: mockRemove,
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
}));

function silentConfig(
  overrides: Partial<CountdownConfig> = {},
): CountdownConfig {
  return {
    enabled: true,
    mode: 'silent',
    duration: { type: 'bars', bars: 1 },
    repeat: 'once',
    ...overrides,
  };
}

function metronomeConfig(
  overrides: Partial<CountdownConfig> = {},
): CountdownConfig {
  return {
    enabled: true,
    mode: 'metronome',
    duration: { type: 'bars', bars: 1 },
    repeat: 'once',
    ...overrides,
  };
}

// Let the awaited click playback (seekTo → play) settle between ticks.
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('countdownEngine', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await countdownEngine.unload();
    mockPlay.mockClear();
    mockSeekTo.mockClear();
    mockRemove.mockClear();
    mockCreateAudioPlayer.mockClear();
  });

  afterEach(async () => {
    await countdownEngine.unload();
    jest.useRealTimers();
  });

  describe('computeTotalBeats', () => {
    it('computes one tick per bar-quarter for bar durations', () => {
      expect(countdownEngine.computeTotalBeats({ type: 'bars', bars: 1 })).toBe(
        4,
      );
      expect(countdownEngine.computeTotalBeats({ type: 'bars', bars: 2 })).toBe(
        8,
      );
      expect(countdownEngine.computeTotalBeats({ type: 'bars', bars: 4 })).toBe(
        16,
      );
    });

    it('computes one tick per second for second durations', () => {
      expect(
        countdownEngine.computeTotalBeats({ type: 'seconds', seconds: 3 }),
      ).toBe(3);
      expect(
        countdownEngine.computeTotalBeats({ type: 'seconds', seconds: 10 }),
      ).toBe(10);
    });

    it('returns at least 1 tick', () => {
      expect(
        countdownEngine.computeTotalBeats({ type: 'seconds', seconds: 0.01 }),
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('subscribe', () => {
    it('notifies with current state on subscribe', () => {
      const listener = jest.fn();
      countdownEngine.subscribe(listener);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'idle' }),
      );
    });

    it('unsubscribes correctly', () => {
      const listener = jest.fn();
      const unsub = countdownEngine.subscribe(listener);
      listener.mockClear();
      unsub();

      const onFinished = jest.fn();
      void countdownEngine.start(silentConfig(), onFinished);
      jest.advanceTimersByTime(1000);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('start (silent mode)', () => {
    it('calls onFinished immediately when disabled', async () => {
      const onFinished = jest.fn();
      await countdownEngine.start(silentConfig({ enabled: false }), onFinished);
      expect(onFinished).toHaveBeenCalled();
    });

    it('starts the countdown with the full tick count', async () => {
      const listener = jest.fn();
      countdownEngine.subscribe(listener);
      listener.mockClear();

      await countdownEngine.start(silentConfig(), jest.fn());

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'counting',
          totalBeats: 4,
          beatsRemaining: 4,
          currentBeat: 0,
          displayValue: 4,
        }),
      );
    });

    it('ticks once per second and finishes', async () => {
      const states: CountdownState[] = [];
      countdownEngine.subscribe((s) => states.push({ ...s }));

      const onFinished = jest.fn();
      await countdownEngine.start(silentConfig(), onFinished);

      // 4 ticks at one second each.
      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1000);

      expect(onFinished).toHaveBeenCalledTimes(1);

      const finished = states.find((s) => s.phase === 'finished');
      expect(finished).toBeDefined();
      expect(finished!.beatsRemaining).toBe(0);
      expect(finished!.currentBeat).toBe(4);
    });

    it('does not play click sounds in silent mode', async () => {
      await countdownEngine.start(silentConfig(), jest.fn());
      jest.advanceTimersByTime(4000);
      expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    });
  });

  describe('displayValue', () => {
    it('counts down in seconds, one per tick', async () => {
      const states: CountdownState[] = [];
      countdownEngine.subscribe((s) => states.push({ ...s }));

      await countdownEngine.start(
        silentConfig({ duration: { type: 'seconds', seconds: 3 } }),
        jest.fn(),
      );

      jest.advanceTimersByTime(1000); // tick 1
      jest.advanceTimersByTime(1000); // tick 2

      const counting = states.filter((s) => s.phase === 'counting');
      expect(counting.map((s) => s.displayValue)).toEqual([3, 2, 1]);
    });

    it('never shows a value below 1 while counting', async () => {
      const states: CountdownState[] = [];
      countdownEngine.subscribe((s) => states.push({ ...s }));

      await countdownEngine.start(
        silentConfig({ duration: { type: 'seconds', seconds: 1 } }),
        jest.fn(),
      );
      jest.advanceTimersByTime(1000);

      const counting = states.filter((s) => s.phase === 'counting');
      expect(counting.every((s) => s.displayValue >= 1)).toBe(true);
    });
  });

  describe('start (metronome mode)', () => {
    it('preloads the click and plays a downbeat at the start', async () => {
      await countdownEngine.start(metronomeConfig(), jest.fn());

      expect(mockCreateAudioPlayer).toHaveBeenCalled();
      // The downbeat fires immediately, not after the first second.
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it('plays a click on each subsequent tick', async () => {
      await countdownEngine.start(metronomeConfig(), jest.fn());
      mockPlay.mockClear();

      jest.advanceTimersByTime(1000);
      await flushMicrotasks();

      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it('preload() warms the click sound without starting', async () => {
      await countdownEngine.preload();
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('cancels an active countdown', async () => {
      const onFinished = jest.fn();
      await countdownEngine.start(silentConfig(), onFinished);

      jest.advanceTimersByTime(1000);
      countdownEngine.cancel();

      expect(countdownEngine.getState().phase).toBe('idle');

      jest.advanceTimersByTime(4000);
      expect(onFinished).not.toHaveBeenCalled();
    });

    it('is safe to call when idle', () => {
      expect(() => countdownEngine.cancel()).not.toThrow();
    });
  });

  describe('unload', () => {
    it('cancels countdown and unloads click sound', async () => {
      await countdownEngine.start(metronomeConfig(), jest.fn());
      await countdownEngine.unload();

      expect(mockRemove).toHaveBeenCalled();
      expect(countdownEngine.getState().phase).toBe('idle');
    });
  });

  describe('getState', () => {
    it('returns idle initially', () => {
      expect(countdownEngine.getState().phase).toBe('idle');
    });
  });
});

import { CountdownConfig, CountdownState } from '../../types';

const mockPlayAsync = jest.fn().mockResolvedValue({});
const mockSetPositionAsync = jest.fn().mockResolvedValue({});
const mockUnloadAsync = jest.fn().mockResolvedValue({});
const mockCreateAsync = jest.fn().mockResolvedValue({
  sound: {
    playAsync: mockPlayAsync,
    setPositionAsync: mockSetPositionAsync,
    unloadAsync: mockUnloadAsync,
  },
});

jest.mock('expo-av', () => {
  return {
    Audio: {
      Sound: {
        createAsync: (...args: unknown[]) => mockCreateAsync(...args),
      },
    },
  };
});

import * as countdownEngine from '../countdownEngine';

function silentConfig(
  overrides: Partial<CountdownConfig> = {},
): CountdownConfig {
  return {
    enabled: true,
    mode: 'silent',
    duration: { type: 'bars', bars: 1 },
    bpm: 120,
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
    bpm: 120,
    ...overrides,
  };
}

describe('countdownEngine', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await countdownEngine.unload();
    mockPlayAsync.mockClear();
    mockSetPositionAsync.mockClear();
    mockUnloadAsync.mockClear();
    mockCreateAsync.mockClear();
  });

  afterEach(async () => {
    await countdownEngine.unload();
    jest.useRealTimers();
  });

  describe('computeTotalBeats', () => {
    it('computes beats for bar-based duration', () => {
      expect(
        countdownEngine.computeTotalBeats({ type: 'bars', bars: 1 }, 120),
      ).toBe(4);
      expect(
        countdownEngine.computeTotalBeats({ type: 'bars', bars: 2 }, 120),
      ).toBe(8);
      expect(
        countdownEngine.computeTotalBeats({ type: 'bars', bars: 4 }, 120),
      ).toBe(16);
    });

    it('computes beats for seconds-based duration', () => {
      expect(
        countdownEngine.computeTotalBeats({ type: 'seconds', seconds: 2 }, 120),
      ).toBe(4);
      expect(
        countdownEngine.computeTotalBeats({ type: 'seconds', seconds: 3 }, 60),
      ).toBe(3);
    });

    it('uses default BPM when bpm is zero', () => {
      expect(
        countdownEngine.computeTotalBeats({ type: 'seconds', seconds: 2 }, 0),
      ).toBe(4);
    });

    it('returns at least 1 beat', () => {
      expect(
        countdownEngine.computeTotalBeats(
          { type: 'seconds', seconds: 0.01 },
          60,
        ),
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('beatIntervalMs', () => {
    it('calculates interval from BPM', () => {
      expect(countdownEngine.beatIntervalMs(120)).toBe(500);
      expect(countdownEngine.beatIntervalMs(60)).toBe(1000);
    });

    it('uses default BPM when zero', () => {
      expect(countdownEngine.beatIntervalMs(0)).toBe(500);
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
      countdownEngine.start(silentConfig(), onFinished);
      jest.advanceTimersByTime(500);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('start (silent mode)', () => {
    it('calls onFinished immediately when disabled', async () => {
      const onFinished = jest.fn();
      await countdownEngine.start(silentConfig({ enabled: false }), onFinished);
      expect(onFinished).toHaveBeenCalled();
    });

    it('starts countdown with correct total beats', async () => {
      const listener = jest.fn();
      countdownEngine.subscribe(listener);
      listener.mockClear();

      const onFinished = jest.fn();
      await countdownEngine.start(silentConfig(), onFinished);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'counting',
          totalBeats: 4,
          beatsRemaining: 4,
          currentBeat: 0,
        }),
      );
    });

    it('ticks through all beats and finishes', async () => {
      const states: CountdownState[] = [];
      countdownEngine.subscribe((s) => states.push({ ...s }));

      const onFinished = jest.fn();
      await countdownEngine.start(silentConfig(), onFinished);

      // 4 beats at 120 BPM = 4 * 500ms = 2000ms
      jest.advanceTimersByTime(500);
      jest.advanceTimersByTime(500);
      jest.advanceTimersByTime(500);
      jest.advanceTimersByTime(500);

      expect(onFinished).toHaveBeenCalledTimes(1);

      const finished = states.find((s) => s.phase === 'finished');
      expect(finished).toBeDefined();
      expect(finished!.beatsRemaining).toBe(0);
      expect(finished!.currentBeat).toBe(4);
    });

    it('does not play click sounds in silent mode', async () => {
      const onFinished = jest.fn();
      await countdownEngine.start(silentConfig(), onFinished);

      jest.advanceTimersByTime(2000);

      expect(mockCreateAsync).not.toHaveBeenCalled();
    });
  });

  describe('start (metronome mode)', () => {
    it('loads and plays click sounds', async () => {
      const onFinished = jest.fn();
      await countdownEngine.start(metronomeConfig(), onFinished);

      expect(mockCreateAsync).toHaveBeenCalled();

      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
      expect(mockPlayAsync).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels an active countdown', async () => {
      const onFinished = jest.fn();
      await countdownEngine.start(silentConfig(), onFinished);

      jest.advanceTimersByTime(500);
      countdownEngine.cancel();

      const state = countdownEngine.getState();
      expect(state.phase).toBe('idle');

      jest.advanceTimersByTime(2000);
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

      expect(mockUnloadAsync).toHaveBeenCalled();
      expect(countdownEngine.getState().phase).toBe('idle');
    });
  });

  describe('getState', () => {
    it('returns idle initially', () => {
      expect(countdownEngine.getState().phase).toBe('idle');
    });
  });
});

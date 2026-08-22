import {
  DEFAULT_COUNTDOWN_CONFIG,
  getCountdownConfig,
  sanitizeCountdownBars,
  sanitizeCountdownConfig,
  sanitizeCountdownDuration,
  sanitizeCountdownMode,
  sanitizeCountdownRepeat,
  sanitizeCountdownSeconds,
  setCountdownConfig,
} from '../countdownStore';
import { CountdownConfig } from '../../types';

// An in-memory stand-in for the platform settings store. Backing the mock with
// a real map is what lets these tests assert the behaviour that actually
// broke — a config written once and read back later — rather than just that
// the right setter was called.
const mockStore = new Map<string, string>();

jest.mock('../settingsStore', () => ({
  getSetting: (key: string) => mockStore.get(key) ?? null,
  setSetting: (key: string, value: string) => {
    mockStore.set(key, value);
  },
  getNumber: (key: string, fallback: number) => {
    const raw = mockStore.get(key);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  setNumber: (key: string, value: number) => {
    mockStore.set(key, String(value));
  },
  getBoolean: (key: string, fallback: boolean) => {
    const raw = mockStore.get(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
  },
  setBoolean: (key: string, value: boolean) => {
    mockStore.set(key, value ? 'true' : 'false');
  },
}));

beforeEach(() => {
  mockStore.clear();
});

describe('countdownStore', () => {
  describe('getCountdownConfig', () => {
    it('returns the default config when nothing is stored', () => {
      expect(getCountdownConfig()).toEqual(DEFAULT_COUNTDOWN_CONFIG);
    });

    it('defaults to a count-in that is off, so an upgrade changes nothing', () => {
      expect(getCountdownConfig().enabled).toBe(false);
    });
  });

  describe('round trip', () => {
    // The regression this store exists for: a configured count-in used to be
    // held in component state and reset every time the player screen unmounted.
    it('reads back a fully configured count-in', () => {
      const config: CountdownConfig = {
        enabled: true,
        mode: 'metronome',
        duration: { type: 'seconds', seconds: 10 },
        repeat: 'everyLoop',
      };

      setCountdownConfig(config);

      expect(getCountdownConfig()).toEqual(config);
    });

    it('reads back a bars duration', () => {
      const config: CountdownConfig = {
        enabled: true,
        mode: 'silent',
        duration: { type: 'bars', bars: 4 },
        repeat: 'once',
      };

      setCountdownConfig(config);

      expect(getCountdownConfig()).toEqual(config);
    });

    it('keeps the seconds amount while a bars duration is active', () => {
      // Mirrors the skip preference keeping its interval while in `full` mode:
      // switching duration type and back restores the amount last picked
      // rather than dropping to the default.
      setCountdownConfig({
        ...DEFAULT_COUNTDOWN_CONFIG,
        duration: { type: 'seconds', seconds: 30 },
      });
      setCountdownConfig({
        ...DEFAULT_COUNTDOWN_CONFIG,
        duration: { type: 'bars', bars: 2 },
      });
      setCountdownConfig({
        ...DEFAULT_COUNTDOWN_CONFIG,
        duration: { type: 'seconds', seconds: 30 },
      });

      expect(getCountdownConfig().duration).toEqual({
        type: 'seconds',
        seconds: 30,
      });
    });

    it('turning the count-in off leaves the rest of the config intact', () => {
      setCountdownConfig({
        enabled: true,
        mode: 'metronome',
        duration: { type: 'seconds', seconds: 15 },
        repeat: 'everyLoop',
      });
      setCountdownConfig({
        enabled: false,
        mode: 'metronome',
        duration: { type: 'seconds', seconds: 15 },
        repeat: 'everyLoop',
      });

      expect(getCountdownConfig()).toEqual({
        enabled: false,
        mode: 'metronome',
        duration: { type: 'seconds', seconds: 15 },
        repeat: 'everyLoop',
      });
    });
  });

  describe('sanitizing stored values', () => {
    it('snaps an unrecognised mode to silent', () => {
      expect(sanitizeCountdownMode('shouty')).toBe('silent');
      expect(sanitizeCountdownMode(null)).toBe('silent');
      expect(sanitizeCountdownMode('metronome')).toBe('metronome');
    });

    it('snaps an unrecognised repeat to once', () => {
      expect(sanitizeCountdownRepeat('sometimes')).toBe('once');
      expect(sanitizeCountdownRepeat(null)).toBe('once');
      expect(sanitizeCountdownRepeat('everyLoop')).toBe('everyLoop');
    });

    it.each([0, -5, 7, NaN, Infinity, -Infinity])(
      'snaps the off-list length %p to the default',
      (seconds) => {
        expect(sanitizeCountdownSeconds(seconds)).toBe(3);
      },
    );

    it.each([1, 3, 5, 10, 15, 30])('keeps the valid length %p', (seconds) => {
      expect(sanitizeCountdownSeconds(seconds)).toBe(seconds);
    });

    it.each([0, 3, 8, NaN, Infinity])(
      'snaps the off-list bar count %p to the default',
      (bars) => {
        expect(sanitizeCountdownBars(bars)).toBe(1);
      },
    );

    it.each([1, 2, 4])('keeps the valid bar count %p', (bars) => {
      expect(sanitizeCountdownBars(bars)).toBe(bars);
    });

    it('keeps a duration type while snapping its amount', () => {
      expect(sanitizeCountdownDuration({ type: 'bars', bars: 9 as 1 })).toEqual(
        {
          type: 'bars',
          bars: 1,
        },
      );
      expect(
        sanitizeCountdownDuration({ type: 'seconds', seconds: 99 }),
      ).toEqual({ type: 'seconds', seconds: 3 });
    });

    it('snaps every part of a config at once', () => {
      expect(
        sanitizeCountdownConfig({
          enabled: true,
          mode: 'loud' as 'silent',
          duration: { type: 'seconds', seconds: 42 },
          repeat: 'always' as 'once',
        }),
      ).toEqual({
        enabled: true,
        mode: 'silent',
        duration: { type: 'seconds', seconds: 3 },
        repeat: 'once',
      });
    });

    it('reads a corrupt stored config back as the default', () => {
      // Values a hand-edited or foreign store could hold.
      setCountdownConfig(DEFAULT_COUNTDOWN_CONFIG);
      mockStore.set('countdown.mode', 'bagpipes');
      mockStore.set('countdown.seconds', 'not-a-number');
      mockStore.set('countdown.repeat', 'twice');

      expect(getCountdownConfig()).toEqual(DEFAULT_COUNTDOWN_CONFIG);
    });
  });

  describe('writes', () => {
    it('persists an off-list length as the default rather than storing it', () => {
      setCountdownConfig({
        ...DEFAULT_COUNTDOWN_CONFIG,
        duration: { type: 'seconds', seconds: 7 },
      });

      expect(mockStore.get('countdown.seconds')).toBe('3');
    });

    // Pin every key by literal name. The round-trip tests above go through
    // whatever constant the store uses, so they would still pass if a key were
    // renamed or made to collide with another store's — `playback.skipSeconds`,
    // say. These are what would catch that.
    it('writes each part under its own namespaced key', () => {
      setCountdownConfig({
        enabled: true,
        mode: 'metronome',
        duration: { type: 'seconds', seconds: 15 },
        repeat: 'everyLoop',
      });

      expect(mockStore.get('countdown.enabled')).toBe('true');
      expect(mockStore.get('countdown.mode')).toBe('metronome');
      expect(mockStore.get('countdown.durationType')).toBe('seconds');
      expect(mockStore.get('countdown.seconds')).toBe('15');
      expect(mockStore.get('countdown.repeat')).toBe('everyLoop');
    });

    it('writes the bars amount under its own key', () => {
      setCountdownConfig({
        ...DEFAULT_COUNTDOWN_CONFIG,
        duration: { type: 'bars', bars: 4 },
      });

      expect(mockStore.get('countdown.durationType')).toBe('bars');
      expect(mockStore.get('countdown.bars')).toBe('4');
    });

    it('every key it writes sits in the countdown namespace', () => {
      setCountdownConfig({
        enabled: true,
        mode: 'metronome',
        duration: { type: 'bars', bars: 2 },
        repeat: 'everyLoop',
      });

      for (const key of mockStore.keys()) {
        expect(key.startsWith('countdown.')).toBe(true);
      }
    });

    // A write that fails part-way leaves older values beside newer ones. The
    // result must still read back as a valid config rather than something the
    // UI cannot render — the tear costs freshness, not integrity.
    it('reads a torn write back as a valid config', () => {
      setCountdownConfig({
        enabled: true,
        mode: 'metronome',
        duration: { type: 'seconds', seconds: 15 },
        repeat: 'everyLoop',
      });
      // Simulate storage dying after the first two keys of a later write.
      mockStore.set('countdown.enabled', 'false');
      mockStore.set('countdown.mode', 'silent');

      expect(getCountdownConfig()).toEqual({
        enabled: false,
        mode: 'silent',
        duration: { type: 'seconds', seconds: 15 },
        repeat: 'everyLoop',
      });
    });
  });
});

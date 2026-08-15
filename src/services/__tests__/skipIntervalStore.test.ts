import {
  DEFAULT_SKIP_PREFERENCE,
  DEFAULT_SKIP_SECONDS,
  formatSkipLabel,
  getSkipPreference,
  getSkipSeconds,
  sanitizeSkipMode,
  sanitizeSkipSeconds,
  setSkipPreference,
  setSkipSeconds,
  SKIP_PRESETS,
} from '../skipIntervalStore';

const mockGetNumber = jest.fn<number, [string, number]>();
const mockSetNumber = jest.fn<void, [string, number]>();
const mockGetSetting = jest.fn<string | null, [string]>();
const mockSetSetting = jest.fn<void, [string, string]>();

jest.mock('../settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
  getSetting: (key: string) => mockGetSetting(key),
  setSetting: (key: string, value: string) => mockSetSetting(key, value),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNumber.mockImplementation((_key, fallback) => fallback);
  mockGetSetting.mockReturnValue(null);
  // clearAllMocks drops recorded calls but keeps implementations, so a test
  // that makes a writer throw would poison every test after it.
  mockSetNumber.mockReset();
  mockSetSetting.mockReset();
});

describe('skipIntervalStore', () => {
  describe('SKIP_PRESETS', () => {
    it('exposes the selectable amounts, from a nudge up to five minutes', () => {
      expect(SKIP_PRESETS).toEqual([1, 3, 5, 10, 15, 30, 60, 300]);
    });

    it('has a default that is itself a preset', () => {
      expect(SKIP_PRESETS).toContain(DEFAULT_SKIP_SECONDS);
    });

    it('has a default preference built from the default amount', () => {
      expect(DEFAULT_SKIP_PREFERENCE).toEqual({
        mode: 'interval',
        seconds: DEFAULT_SKIP_SECONDS,
      });
    });
  });

  describe('formatSkipLabel', () => {
    it('renders sub-minute amounts in seconds', () => {
      expect(formatSkipLabel(1)).toBe('1s');
      expect(formatSkipLabel(30)).toBe('30s');
    });

    it('renders a minute and above in whole minutes', () => {
      expect(formatSkipLabel(60)).toBe('1m');
      expect(formatSkipLabel(300)).toBe('5m');
    });

    it('labels every preset', () => {
      for (const seconds of SKIP_PRESETS) {
        expect(formatSkipLabel(seconds)).toMatch(/^\d+[sm]$/);
      }
    });
  });

  describe('sanitizeSkipSeconds', () => {
    it('passes every preset through unchanged', () => {
      for (const seconds of SKIP_PRESETS) {
        expect(sanitizeSkipSeconds(seconds)).toBe(seconds);
      }
    });

    it('snaps an off-list amount to the default', () => {
      expect(sanitizeSkipSeconds(7)).toBe(DEFAULT_SKIP_SECONDS);
      expect(sanitizeSkipSeconds(2.5)).toBe(DEFAULT_SKIP_SECONDS);
      expect(sanitizeSkipSeconds(45)).toBe(DEFAULT_SKIP_SECONDS);
    });

    // Membership in the preset list is the whole contract: every preset is
    // finite and positive, so these all fail it without a separate range check.
    it.each([
      ['zero', 0],
      ['negative', -5],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['-Infinity', Number.NEGATIVE_INFINITY],
    ])('rejects %s and falls back to the default', (_label, value) => {
      expect(sanitizeSkipSeconds(value)).toBe(DEFAULT_SKIP_SECONDS);
    });
  });

  describe('sanitizeSkipMode', () => {
    it('passes full through unchanged', () => {
      expect(sanitizeSkipMode('full')).toBe('full');
    });

    it.each([
      ['interval', 'interval'],
      ['an unknown mode', 'sideways'],
      ['an empty string', ''],
      ['nothing stored', null],
    ])('reads %s as interval', (_label, value) => {
      expect(sanitizeSkipMode(value)).toBe('interval');
    });
  });

  describe('getSkipSeconds', () => {
    it('reads under the playback.skipSeconds key with the default fallback', () => {
      getSkipSeconds();
      expect(mockGetNumber).toHaveBeenCalledWith(
        'playback.skipSeconds',
        DEFAULT_SKIP_SECONDS,
      );
    });

    it('returns a stored preset', () => {
      mockGetNumber.mockReturnValue(30);
      expect(getSkipSeconds()).toBe(30);
    });

    it('snaps a corrupted stored value onto the default', () => {
      mockGetNumber.mockReturnValue(7);
      expect(getSkipSeconds()).toBe(DEFAULT_SKIP_SECONDS);
    });

    it('propagates a storage failure to the caller', () => {
      mockGetNumber.mockImplementation(() => {
        throw new Error('db unavailable');
      });
      expect(() => getSkipSeconds()).toThrow('db unavailable');
    });
  });

  describe('setSkipSeconds', () => {
    it('persists a preset unchanged', () => {
      setSkipSeconds(15);
      expect(mockSetNumber).toHaveBeenCalledWith('playback.skipSeconds', 15);
    });

    it('never writes an off-list amount to storage', () => {
      setSkipSeconds(7);
      expect(mockSetNumber).toHaveBeenCalledWith(
        'playback.skipSeconds',
        DEFAULT_SKIP_SECONDS,
      );
    });

    it('propagates a storage failure to the caller', () => {
      mockSetNumber.mockImplementation(() => {
        throw new Error('write failed');
      });
      expect(() => setSkipSeconds(10)).toThrow('write failed');
    });
  });

  describe('getSkipPreference', () => {
    it('reads the mode under the playback.skipMode key', () => {
      getSkipPreference();
      expect(mockGetSetting).toHaveBeenCalledWith('playback.skipMode');
    });

    it('combines a stored mode and amount', () => {
      mockGetSetting.mockReturnValue('full');
      mockGetNumber.mockReturnValue(60);
      expect(getSkipPreference()).toEqual({ mode: 'full', seconds: 60 });
    });

    // The mode key postdates the amount key, so an install that predates full
    // mode has an amount and no mode. It must keep its amount.
    it('keeps a stored amount when no mode has ever been written', () => {
      mockGetSetting.mockReturnValue(null);
      mockGetNumber.mockReturnValue(30);
      expect(getSkipPreference()).toEqual({ mode: 'interval', seconds: 30 });
    });

    it('snaps both halves of a corrupted preference', () => {
      mockGetSetting.mockReturnValue('sideways');
      mockGetNumber.mockReturnValue(7);
      expect(getSkipPreference()).toEqual(DEFAULT_SKIP_PREFERENCE);
    });
  });

  describe('setSkipPreference', () => {
    it('persists both halves', () => {
      setSkipPreference({ mode: 'full', seconds: 300 });
      expect(mockSetSetting).toHaveBeenCalledWith('playback.skipMode', 'full');
      expect(mockSetNumber).toHaveBeenCalledWith('playback.skipSeconds', 300);
    });

    // Writing the amount in full mode too is what lets a later switch back to
    // interval restore the user's choice instead of the default.
    it('still writes the amount while in full mode', () => {
      setSkipPreference({ mode: 'full', seconds: 15 });
      expect(mockSetNumber).toHaveBeenCalledWith('playback.skipSeconds', 15);
    });

    it('never writes an off-list mode or amount', () => {
      setSkipPreference({
        mode: 'sideways',
        seconds: 7,
      } as unknown as Parameters<typeof setSkipPreference>[0]);
      expect(mockSetSetting).toHaveBeenCalledWith(
        'playback.skipMode',
        'interval',
      );
      expect(mockSetNumber).toHaveBeenCalledWith(
        'playback.skipSeconds',
        DEFAULT_SKIP_SECONDS,
      );
    });

    it('propagates a storage failure to the caller', () => {
      mockSetSetting.mockImplementation(() => {
        throw new Error('write failed');
      });
      expect(() =>
        setSkipPreference({ mode: 'interval', seconds: 10 }),
      ).toThrow('write failed');
    });
  });
});

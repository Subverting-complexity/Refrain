import {
  DEFAULT_SKIP_SECONDS,
  getSkipSeconds,
  sanitizeSkipSeconds,
  setSkipSeconds,
  SKIP_PRESETS,
} from '../skipIntervalStore';

const mockGetNumber = jest.fn<number, [string, number]>();
const mockSetNumber = jest.fn<void, [string, number]>();

jest.mock('../settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNumber.mockImplementation((_key, fallback) => fallback);
});

describe('skipIntervalStore', () => {
  describe('SKIP_PRESETS', () => {
    it('exposes the selectable amounts', () => {
      expect(SKIP_PRESETS).toEqual([1, 3, 5, 10, 15, 30]);
    });

    it('has a default that is itself a preset', () => {
      expect(SKIP_PRESETS).toContain(DEFAULT_SKIP_SECONDS);
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
      expect(sanitizeSkipSeconds(60)).toBe(DEFAULT_SKIP_SECONDS);
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
});

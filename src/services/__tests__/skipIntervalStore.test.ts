import {
  DEFAULT_SKIP_SECONDS,
  getSkipSeconds,
  sanitize,
  setSkipSeconds,
  SKIP_PRESETS,
} from '../skipIntervalStore';

const mockGetNumber = jest.fn<number, [string, number]>();
const mockSetNumber = jest.fn<void, [string, number]>();

jest.mock('../settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
}));

const SKIP_SETTING_KEY = 'playback.skipSeconds';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNumber.mockImplementation((_key, fallback) => fallback);
});

describe('skipIntervalStore', () => {
  describe('constants', () => {
    it('exposes the selectable presets', () => {
      expect(SKIP_PRESETS).toEqual([1, 3, 5, 10, 15, 30]);
    });

    it('defaults to 5 seconds', () => {
      expect(DEFAULT_SKIP_SECONDS).toBe(5);
    });
  });

  describe('sanitize', () => {
    it.each(SKIP_PRESETS)('keeps preset value %d', (preset) => {
      expect(sanitize(preset)).toBe(preset);
    });

    it('snaps an off-list value to the default', () => {
      expect(sanitize(7)).toBe(DEFAULT_SKIP_SECONDS);
      expect(sanitize(4)).toBe(DEFAULT_SKIP_SECONDS);
      expect(sanitize(31)).toBe(DEFAULT_SKIP_SECONDS);
    });

    it('rejects zero and negative values', () => {
      expect(sanitize(0)).toBe(DEFAULT_SKIP_SECONDS);
      expect(sanitize(-5)).toBe(DEFAULT_SKIP_SECONDS);
    });

    it('rejects non-finite values', () => {
      expect(sanitize(NaN)).toBe(DEFAULT_SKIP_SECONDS);
      expect(sanitize(Infinity)).toBe(DEFAULT_SKIP_SECONDS);
      expect(sanitize(-Infinity)).toBe(DEFAULT_SKIP_SECONDS);
    });
  });

  describe('getSkipSeconds', () => {
    it('reads the stored value under the skip key, defaulting when unset', () => {
      getSkipSeconds();
      expect(mockGetNumber).toHaveBeenCalledWith(
        SKIP_SETTING_KEY,
        DEFAULT_SKIP_SECONDS,
      );
    });

    it('returns a persisted preset unchanged', () => {
      mockGetNumber.mockReturnValue(10);
      expect(getSkipSeconds()).toBe(10);
    });

    it('normalizes a corrupted stored value to the default', () => {
      mockGetNumber.mockReturnValue(7);
      expect(getSkipSeconds()).toBe(DEFAULT_SKIP_SECONDS);
    });
  });

  describe('setSkipSeconds', () => {
    it('persists a valid preset and returns it', () => {
      expect(setSkipSeconds(15)).toBe(15);
      expect(mockSetNumber).toHaveBeenCalledWith(SKIP_SETTING_KEY, 15);
    });

    it('persists the sanitized value for an off-list amount', () => {
      expect(setSkipSeconds(7)).toBe(DEFAULT_SKIP_SECONDS);
      expect(mockSetNumber).toHaveBeenCalledWith(
        SKIP_SETTING_KEY,
        DEFAULT_SKIP_SECONDS,
      );
    });
  });
});

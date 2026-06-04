/* eslint-disable @typescript-eslint/no-require-imports */

const mockRunSync = jest.fn();
const mockGetFirstSync = jest.fn();
const mockExecSync = jest.fn();
const mockCloseSync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    runSync: mockRunSync,
    getFirstSync: mockGetFirstSync,
    execSync: mockExecSync,
    closeSync: mockCloseSync,
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  mockGetFirstSync.mockReturnValue(undefined);
});

describe('settingsStore', () => {
  describe('getSetting', () => {
    it('returns the stored value', () => {
      mockGetFirstSync.mockReturnValue({ value: 'hello' });
      const { getSetting } = require('../settingsStore');

      expect(getSetting('greeting')).toBe('hello');
      expect(mockGetFirstSync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT value FROM settings'),
        'greeting',
      );
    });

    it('returns null when the key is absent', () => {
      mockGetFirstSync.mockReturnValue(undefined);
      const { getSetting } = require('../settingsStore');

      expect(getSetting('missing')).toBeNull();
    });
  });

  describe('setSetting', () => {
    it('upserts the key/value pair', () => {
      const { setSetting } = require('../settingsStore');

      setSetting('greeting', 'hi');

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings'),
        'greeting',
        'hi',
      );
    });
  });

  describe('getNumber', () => {
    it('parses a stored numeric string', () => {
      mockGetFirstSync.mockReturnValue({ value: '0.42' });
      const { getNumber } = require('../settingsStore');

      expect(getNumber('vol', 1)).toBe(0.42);
    });

    it('returns the fallback when the key is absent', () => {
      mockGetFirstSync.mockReturnValue(undefined);
      const { getNumber } = require('../settingsStore');

      expect(getNumber('vol', 0.8)).toBe(0.8);
    });

    it('returns the fallback when the stored value is not a number', () => {
      mockGetFirstSync.mockReturnValue({ value: 'not-a-number' });
      const { getNumber } = require('../settingsStore');

      expect(getNumber('vol', 0.5)).toBe(0.5);
    });
  });

  describe('setNumber', () => {
    it('stores the number as a string', () => {
      const { setNumber } = require('../settingsStore');

      setNumber('vol', 0.25);

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings'),
        'vol',
        '0.25',
      );
    });
  });
});

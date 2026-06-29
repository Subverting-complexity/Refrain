/* eslint-disable @typescript-eslint/no-require-imports */

const mockGetSetting = jest.fn<string | null, [string]>();
const mockSetSetting = jest.fn<void, [string, string]>();

jest.mock('../settingsStore', () => ({
  getSetting: (key: string) => mockGetSetting(key),
  setSetting: (key: string, value: string) => mockSetSetting(key, value),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('themeStore', () => {
  describe('getColorMode', () => {
    it('defaults to "system" when nothing is stored', () => {
      mockGetSetting.mockReturnValue(null);
      const { getColorMode } = require('../themeStore');

      expect(getColorMode()).toBe('system');
      expect(mockGetSetting).toHaveBeenCalledWith('theme.colorMode');
    });

    it.each(['system', 'light', 'dark'])(
      'returns the persisted mode "%s"',
      (mode) => {
        mockGetSetting.mockReturnValue(mode);
        const { getColorMode } = require('../themeStore');

        expect(getColorMode()).toBe(mode);
      },
    );

    it('falls back to "system" for an unrecognized stored value', () => {
      mockGetSetting.mockReturnValue('sepia');
      const { getColorMode } = require('../themeStore');

      expect(getColorMode()).toBe('system');
    });
  });

  describe('setColorMode', () => {
    it('persists the mode under the theme key', () => {
      const { setColorMode } = require('../themeStore');

      setColorMode('dark');

      expect(mockSetSetting).toHaveBeenCalledWith('theme.colorMode', 'dark');
    });

    it('round-trips a persisted choice back through getColorMode', () => {
      const store: Record<string, string> = {};
      mockSetSetting.mockImplementation((key, value) => {
        store[key] = value;
      });
      mockGetSetting.mockImplementation((key) => store[key] ?? null);
      const { getColorMode, setColorMode } = require('../themeStore');

      setColorMode('light');

      expect(getColorMode()).toBe('light');
    });
  });
});

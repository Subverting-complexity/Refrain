/* eslint-disable @typescript-eslint/no-require-imports */

const mockGetBoolean = jest.fn<boolean, [string, boolean]>();
const mockSetBoolean = jest.fn<void, [string, boolean]>();

jest.mock('../settingsStore', () => ({
  getBoolean: (key: string, fallback: boolean) => mockGetBoolean(key, fallback),
  setBoolean: (key: string, value: boolean) => mockSetBoolean(key, value),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('snippetPreviewStore', () => {
  describe('getSnippetPreviewEnabled', () => {
    it('reads from the settings store, defaulting ON when unset', () => {
      // The store returns the fallback for an absent key; assert the default
      // passed in is ON.
      mockGetBoolean.mockImplementation((_key, fallback) => fallback);
      const { getSnippetPreviewEnabled } = require('../snippetPreviewStore');

      expect(getSnippetPreviewEnabled()).toBe(true);
      expect(mockGetBoolean).toHaveBeenCalledWith(
        'snippetPreview.enabled',
        true,
      );
    });

    it('returns the persisted value when one is stored', () => {
      mockGetBoolean.mockReturnValue(false);
      const { getSnippetPreviewEnabled } = require('../snippetPreviewStore');

      expect(getSnippetPreviewEnabled()).toBe(false);
    });
  });

  describe('setSnippetPreviewEnabled', () => {
    it('persists the value under the snippet-preview key', () => {
      const { setSnippetPreviewEnabled } = require('../snippetPreviewStore');

      setSnippetPreviewEnabled(false);

      expect(mockSetBoolean).toHaveBeenCalledWith(
        'snippetPreview.enabled',
        false,
      );
    });
  });
});

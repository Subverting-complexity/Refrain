/**
 * @jest-environment node
 *
 * Web settings store. Keeps the synchronous public API native callers depend
 * on by serving reads from an in-memory cache hydrated from the async
 * database, persisting writes in the background.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const mockGetAllStoredSettings = jest.fn();
const mockPutStoredSetting = jest.fn<Promise<void>, [string, string]>();

jest.mock('../database.web', () => ({
  getAllStoredSettings: () => mockGetAllStoredSettings(),
  putStoredSetting: (key: string, value: string) =>
    mockPutStoredSetting(key, value),
}));

type SettingsModule = typeof import('../settingsStore.web');

/**
 * Re-imports the module so its eager hydration runs fresh against the current
 * mock return values. The module caches state at the module level, so each
 * test needs an isolated instance.
 */
async function loadModule(): Promise<SettingsModule> {
  let mod!: SettingsModule;
  jest.isolateModules(() => {
    mod = require('../settingsStore.web');
  });
  await mod.hydrateSettings();
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllStoredSettings.mockResolvedValue([]);
  mockPutStoredSetting.mockResolvedValue(undefined);
});

describe('hydrateSettings', () => {
  it('loads existing rows into the cache for synchronous reads', async () => {
    mockGetAllStoredSettings.mockResolvedValue([
      { key: 'volume', value: '0.5' },
    ]);
    const settings = await loadModule();
    expect(settings.getSetting('volume')).toBe('0.5');
    expect(settings.getNumber('volume', 1)).toBe(0.5);
  });

  it('leaves reads at their defaults when hydration fails', async () => {
    mockGetAllStoredSettings.mockRejectedValue(new Error('db unavailable'));
    const settings = await loadModule();
    expect(settings.getSetting('volume')).toBeNull();
    expect(settings.getNumber('volume', 0.8)).toBe(0.8);
  });
});

describe('getSetting / getNumber', () => {
  it('returns null / fallback for an absent key', async () => {
    const settings = await loadModule();
    expect(settings.getSetting('missing')).toBeNull();
    expect(settings.getNumber('missing', 0.8)).toBe(0.8);
  });

  it('returns the fallback when the stored value is not a finite number', async () => {
    mockGetAllStoredSettings.mockResolvedValue([
      { key: 'volume', value: 'not-a-num' },
    ]);
    const settings = await loadModule();
    expect(settings.getNumber('volume', 0.8)).toBe(0.8);
  });
});

describe('setSetting / setNumber', () => {
  it('updates the cache synchronously and persists in the background', async () => {
    const settings = await loadModule();

    settings.setNumber('volume', 0.3);
    // Read reflects the write immediately (synchronous cache).
    expect(settings.getNumber('volume', 1)).toBe(0.3);

    // The background persist runs against the store.
    await Promise.resolve();
    await Promise.resolve();
    expect(mockPutStoredSetting).toHaveBeenCalledWith('volume', '0.3');
  });

  it('keeps the cached value even when persistence fails', async () => {
    mockPutStoredSetting.mockRejectedValue(new Error('write failed'));
    const settings = await loadModule();

    settings.setSetting('theme', 'dark');
    expect(settings.getSetting('theme')).toBe('dark');
    // Let the rejected persist settle without surfacing.
    await Promise.resolve();
    await Promise.resolve();
  });
});

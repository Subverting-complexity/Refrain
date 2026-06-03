/**
 * Web-platform guard for the track store.
 *
 * On web the `expo-file-system` `File`/`Directory` constructors throw, so the
 * legacy JSON migration and orphan sweep must be skipped. The mocks below
 * throw from those constructors to mimic the real web stub; loading tracks
 * and sweeping orphans must not crash.
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const mockGetAllSync = jest.fn(() => []);

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    runSync: jest.fn(),
    getAllSync: mockGetAllSync,
    getFirstSync: jest.fn(),
    execSync: jest.fn(),
    closeSync: jest.fn(),
  })),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => {
    throw new TypeError('this.validatePath is not a function');
  }),
  Directory: jest.fn(() => {
    throw new TypeError('this.validatePath is not a function');
  }),
  Paths: { document: 'file:///data' },
}));

import { cleanupOrphanFiles, loadTracks } from '../trackStore';

describe('track store on web', () => {
  it('loadTracks does not crash when filesystem is unsupported', async () => {
    await expect(loadTracks()).resolves.toEqual([]);
  });

  it('cleanupOrphanFiles returns 0 without touching the filesystem', () => {
    expect(cleanupOrphanFiles()).toBe(0);
  });
});

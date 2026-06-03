/**
 * Web-platform guard for file import.
 *
 * `FILE_SYSTEM_SUPPORTED` is captured from `Platform.OS` at module load, so
 * these tests force `Platform.OS === 'web'` before importing the module under
 * test. The `expo-file-system` mock throws from the `File` constructor to
 * mimic the real web stub (`this.validatePath is not a function`); the guard
 * must short-circuit before that crash can propagate.
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('expo-file-system', () => ({
  File: Object.assign(
    jest.fn(() => {
      throw new TypeError('this.validatePath is not a function');
    }),
    { pickFileAsync: jest.fn() },
  ),
  Directory: jest.fn(),
  Paths: { document: 'file:///data' },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

import { importFromUri, pickAndImportFile } from '../fileImport';

describe('file import on web', () => {
  it('importFromUri returns unsupported_platform instead of crashing', async () => {
    const result = await importFromUri('file:///shared/beat.wav', 'beat.wav');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('unsupported_platform');
    }
  });

  it('pickAndImportFile returns unsupported_platform instead of crashing', async () => {
    const result = await pickAndImportFile();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('unsupported_platform');
    }
  });
});

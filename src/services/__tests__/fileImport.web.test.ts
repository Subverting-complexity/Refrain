import { pickAndImportFile, importFromUri } from '../fileImport';

// On web, expo-file-system's File/Directory constructors call a native-only
// `validatePath` method that does not exist, so `new File(...)` throws. These
// mocks reproduce that: any construction throws, and pickFileAsync would throw
// too. The web guards must short-circuit before any of this is reached.
jest.mock('expo-file-system', () => ({
  File: Object.assign(
    jest.fn(() => {
      throw new TypeError('this.validatePath is not a function');
    }),
    {
      pickFileAsync: jest.fn(() => {
        throw new Error('pickFileAsync is unavailable on web');
      }),
    },
  ),
  Directory: jest.fn(() => {
    throw new TypeError('this.validatePath is not a function');
  }),
  Paths: { document: 'file:///data' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

const { File } = jest.requireMock('expo-file-system') as {
  File: jest.Mock & { pickFileAsync: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fileImport on web', () => {
  it('importFromUri returns unsupported_platform without constructing a File', async () => {
    const result = await importFromUri('file:///incoming/song.mp3', 'song.mp3');

    expect(result).toEqual({
      success: false,
      error: 'unsupported_platform',
      message: expect.any(String),
    });
    expect(File).not.toHaveBeenCalled();
  });

  it('pickAndImportFile returns unsupported_platform without calling the picker', async () => {
    const result = await pickAndImportFile();

    expect(result).toEqual({
      success: false,
      error: 'unsupported_platform',
      message: expect.any(String),
    });
    expect(File.pickFileAsync).not.toHaveBeenCalled();
  });

  it('does not throw the native validatePath error on web', async () => {
    await expect(
      importFromUri('file:///incoming/song.mp3', 'song.mp3'),
    ).resolves.toBeDefined();
    await expect(pickAndImportFile()).resolves.toBeDefined();
    // Sanity-check the mock actually throws when constructed, proving the
    // guard — not a benign mock — is what kept us from crashing.
    expect(() => new File('file:///x')).toThrow('validatePath');
  });
});

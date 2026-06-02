import {
  pickAndImportFile,
  importFromUri,
  isSupportedFilename,
} from '../fileImport';

const mockCopy = jest.fn();
const mockDirCreate = jest.fn();

let mockDirExists = false;
let mockFileExists = true;
let mockFileSize = 1_000_000;

jest.mock('expo-file-system', () => {
  return {
    File: Object.assign(
      jest.fn().mockImplementation((...args: unknown[]) => {
        const uri =
          args.length === 2
            ? `${(args[0] as { uri: string }).uri}/${args[1]}`
            : (args[0] as string);
        return {
          uri,
          get exists() {
            return mockFileExists;
          },
          get size() {
            return mockFileSize;
          },
          get name() {
            return uri.split('/').pop();
          },
          copy: mockCopy,
        };
      }),
      {
        pickFileAsync: jest.fn(),
      },
    ),
    Directory: jest.fn().mockImplementation(() => ({
      get exists() {
        return mockDirExists;
      },
      create: mockDirCreate,
      uri: 'file:///data/tracks',
    })),
    Paths: { document: 'file:///data' },
  };
});

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

const { File } = jest.requireMock('expo-file-system') as {
  File: jest.Mock & { pickFileAsync: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDirExists = false;
  mockFileExists = true;
  mockFileSize = 1_000_000;
});

describe('isSupportedFilename', () => {
  it('accepts mp3', () => {
    expect(isSupportedFilename('song.mp3')).toBe(true);
  });

  it('accepts wav', () => {
    expect(isSupportedFilename('loop.wav')).toBe(true);
  });

  it('accepts aac', () => {
    expect(isSupportedFilename('clip.aac')).toBe(true);
  });

  it('accepts m4a', () => {
    expect(isSupportedFilename('voice.m4a')).toBe(true);
  });

  it('rejects unsupported extensions', () => {
    expect(isSupportedFilename('image.png')).toBe(false);
    expect(isSupportedFilename('doc.pdf')).toBe(false);
    expect(isSupportedFilename('noext')).toBe(false);
  });

  it('is case-insensitive on extension', () => {
    expect(isSupportedFilename('SONG.MP3')).toBe(true);
    expect(isSupportedFilename('song.Wav')).toBe(true);
  });
});

describe('pickAndImportFile', () => {
  it('returns cancelled when user cancels picker', async () => {
    File.pickFileAsync.mockResolvedValue({ canceled: true });

    const result = await pickAndImportFile();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('cancelled');
    }
  });

  it('imports a picked mp3 file', async () => {
    File.pickFileAsync.mockResolvedValue({
      canceled: false,
      result: {
        uri: 'file:///picked/song.mp3',
        name: 'song.mp3',
        exists: true,
        size: 500_000,
        copy: mockCopy,
      },
    });

    const result = await pickAndImportFile();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.id).toBe('test-uuid-1234');
      expect(result.track.filename).toBe('song.mp3');
      expect(result.track.format).toBe('mp3');
      expect(result.track.fileSizeBytes).toBe(mockFileSize);
      expect(result.track.durationMs).toBeGreaterThan(0);
      expect(result.track.durationEstimated).toBe(true);
      expect(mockCopy).toHaveBeenCalled();
    }
  });

  it('creates tracks directory if missing', async () => {
    mockDirExists = false;
    File.pickFileAsync.mockResolvedValue({
      canceled: false,
      result: {
        uri: 'file:///picked/song.mp3',
        name: 'song.mp3',
        exists: true,
        size: 500_000,
        copy: mockCopy,
      },
    });

    await pickAndImportFile();

    expect(mockDirCreate).toHaveBeenCalled();
  });

  it('skips directory creation if already exists', async () => {
    mockDirExists = true;
    File.pickFileAsync.mockResolvedValue({
      canceled: false,
      result: {
        uri: 'file:///picked/song.mp3',
        name: 'song.mp3',
        exists: true,
        size: 500_000,
        copy: mockCopy,
      },
    });

    await pickAndImportFile();

    expect(mockDirCreate).not.toHaveBeenCalled();
  });

  it('returns unsupported_format for unknown extension', async () => {
    File.pickFileAsync.mockResolvedValue({
      canceled: false,
      result: {
        uri: 'file:///picked/image.png',
        name: 'image.png',
        exists: true,
        size: 500_000,
        copy: mockCopy,
      },
    });

    const result = await pickAndImportFile();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('unsupported_format');
    }
  });

  it('returns copy_failed when copy throws', async () => {
    File.pickFileAsync.mockResolvedValue({
      canceled: false,
      result: {
        uri: 'file:///picked/song.mp3',
        name: 'song.mp3',
        exists: true,
        size: 500_000,
        copy: jest.fn().mockRejectedValue(new Error('disk full')),
      },
    });

    const result = await pickAndImportFile();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('copy_failed');
    }
  });

  it('defaults filename when picker returns null name', async () => {
    File.pickFileAsync.mockResolvedValue({
      canceled: false,
      result: {
        uri: 'file:///picked/unknown',
        name: null,
        exists: true,
        size: 500_000,
        copy: mockCopy,
      },
    });

    const result = await pickAndImportFile();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.filename).toBe('unknown.mp3');
      expect(result.track.format).toBe('mp3');
    }
  });
});

describe('importFromUri', () => {
  it('imports a file from URI', async () => {
    const result = await importFromUri('file:///shared/beat.wav', 'beat.wav');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.filename).toBe('beat.wav');
      expect(result.track.format).toBe('wav');
    }
  });

  it('returns file_not_found when source missing', async () => {
    mockFileExists = false;

    const result = await importFromUri('file:///missing/song.mp3', 'song.mp3');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('file_not_found');
    }
  });

  it('returns unsupported_format for bad extension', async () => {
    const result = await importFromUri('file:///shared/photo.jpg', 'photo.jpg');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('unsupported_format');
    }
  });

  it('estimates different durations per format', async () => {
    mockFileSize = 1_000_000;

    const mp3 = await importFromUri('file:///a.mp3', 'a.mp3');
    const wav = await importFromUri('file:///a.wav', 'a.wav');

    expect(mp3.success && wav.success).toBe(true);
    if (mp3.success && wav.success) {
      expect(wav.track.durationMs).toBeLessThan(mp3.track.durationMs);
    }
  });
});

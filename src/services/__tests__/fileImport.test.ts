import {
  pickAndImportFile,
  importFromUri,
  isSupportedFilename,
} from '../fileImport';

const mockCopy = jest.fn();
const mockMove = jest.fn();
const mockDelete = jest.fn();
const mockClose = jest.fn();
const mockDirCreate = jest.fn();

let mockDirExists = false;
let mockFileExists = true;
let mockFileSize = 1_000_000;

/**
 * The first bytes a file in app storage reports, or null when it cannot be
 * opened at all. Only reached once the declared type and the filename have
 * both failed to name a format.
 */
let mockHeadBytes: Uint8Array | null = null;

jest.mock('expo-file-system', () => {
  return {
    FileMode: { ReadOnly: 'r' },
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
          get type() {
            return '';
          },
          copy: mockCopy,
          move: mockMove,
          delete: mockDelete,
          open: () => {
            if (!mockHeadBytes) throw new Error('cannot open file');
            return { readBytes: () => mockHeadBytes, close: mockClose };
          },
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

const mockRandomUUID = jest.fn<string, []>(() => 'test-uuid-1234');

jest.mock('expo-crypto', () => ({
  randomUUID: () => mockRandomUUID(),
  // `generateId` falls back to this when randomUUID is unavailable.
  getRandomValues: (arr: Uint8Array) => arr.fill(0xab),
}));

const { File } = jest.requireMock('expo-file-system') as {
  File: jest.Mock & { pickFileAsync: jest.Mock };
};

/**
 * A file as the picker actually returns it. `name` is `basename(uri)` — expo
 * rebuilds the picked file from its URI and drops the provider's display
 * name — so the tests below spell out the URI and let the name follow from
 * it, exactly as it does on a device.
 */
function pickedFile({
  uri,
  name,
  type = '',
  copy = mockCopy,
}: {
  uri: string;
  name: string;
  type?: string;
  copy?: jest.Mock;
}) {
  return {
    canceled: false,
    result: { uri, name, type, exists: true, size: 500_000, copy },
  };
}

const MP3_FRAME = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
const WAV_HEADER = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x08, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
]);

beforeEach(() => {
  jest.clearAllMocks();
  mockDirExists = false;
  mockFileExists = true;
  mockFileSize = 1_000_000;
  mockHeadBytes = null;
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

  it('offers audio/* to the picker so no playable file is greyed out', async () => {
    File.pickFileAsync.mockResolvedValue({ canceled: true });

    await pickAndImportFile();

    const { mimeTypes } = File.pickFileAsync.mock.calls[0][0];
    expect(mimeTypes).toContain('audio/*');
    expect(mimeTypes).toContain('audio/mpeg');
    expect(mimeTypes).toContain('audio/mp4');
  });

  it('imports a picked mp3 file', async () => {
    File.pickFileAsync.mockResolvedValue(
      pickedFile({ uri: 'file:///picked/song.mp3', name: 'song.mp3' }),
    );

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

  it('still imports when randomUUID is unavailable', async () => {
    // Import goes through the shared `generateId`, which falls back to
    // getRandomValues. Calling Crypto.randomUUID directly here used to let its
    // secure-context throw escape importFromFile ahead of the try/catch.
    mockRandomUUID.mockImplementationOnce(() => {
      throw new TypeError('randomUUID is not a function');
    });
    File.pickFileAsync.mockResolvedValue(
      pickedFile({ uri: 'file:///picked/song.mp3', name: 'song.mp3' }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.id).toBe('abababab-abab-4bab-abab-abababababab');
      expect(mockCopy).toHaveBeenCalled();
    }
  });

  it('creates tracks directory if missing', async () => {
    mockDirExists = false;
    File.pickFileAsync.mockResolvedValue(
      pickedFile({ uri: 'file:///picked/song.mp3', name: 'song.mp3' }),
    );

    await pickAndImportFile();

    expect(mockDirCreate).toHaveBeenCalled();
  });

  it('skips directory creation if already exists', async () => {
    mockDirExists = true;
    File.pickFileAsync.mockResolvedValue(
      pickedFile({ uri: 'file:///picked/song.mp3', name: 'song.mp3' }),
    );

    await pickAndImportFile();

    expect(mockDirCreate).not.toHaveBeenCalled();
  });

  it('returns unsupported_format for unknown extension', async () => {
    File.pickFileAsync.mockResolvedValue(
      pickedFile({ uri: 'file:///picked/image.png', name: 'image.png' }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('unsupported_format');
      expect(result.message).toBe('Unsupported format: png');
    }
  });

  it('returns copy_failed when copy throws', async () => {
    File.pickFileAsync.mockResolvedValue(
      pickedFile({
        uri: 'file:///picked/song.mp3',
        name: 'song.mp3',
        copy: jest.fn().mockRejectedValue(new Error('disk full')),
      }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('copy_failed');
    }
  });
});

/**
 * The Play Store rejection this covers: on Android the picker hands back a
 * Storage Access Framework document URI, and the name derived from it is an
 * opaque provider id rather than a filename. Every import that went through
 * one of these failed with "Unsupported format:" and nothing after the colon.
 */
describe('pickAndImportFile with Android SAF document URIs', () => {
  it('imports from the media provider, whose name is an opaque id', async () => {
    File.pickFileAsync.mockResolvedValue(
      pickedFile({
        uri: 'content://com.android.providers.media.documents/document/audio%3A1000000033',
        name: 'audio:1000000033',
        type: 'audio/mpeg',
      }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.format).toBe('mp3');
      // The document id must never reach the library as a track name.
      expect(result.track.filename).toBe('Imported track.mp3');
      expect(result.track.uri).toBe('file:///data/tracks/test-uuid-1234.mp3');
    }
  });

  it('imports from the downloads provider on the declared type alone', async () => {
    File.pickFileAsync.mockResolvedValue(
      pickedFile({
        uri: 'content://com.android.providers.downloads.documents/document/msf%3A42',
        name: 'msf:42',
        type: 'audio/x-m4a',
      }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.format).toBe('m4a');
      expect(result.track.filename).toBe('Imported track.m4a');
    }
  });

  it('keeps the real name when the external storage provider encodes a path', async () => {
    File.pickFileAsync.mockResolvedValue(
      pickedFile({
        uri: 'content://com.android.externalstorage.documents/document/primary%3AMusic%2FMy%20Song.mp3',
        name: 'My Song.mp3',
        type: 'audio/mpeg',
      }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.filename).toBe('My Song.mp3');
    }
  });

  it('identifies the file from its bytes when the provider reports a generic type', async () => {
    mockHeadBytes = WAV_HEADER;
    File.pickFileAsync.mockResolvedValue(
      pickedFile({
        uri: 'content://com.example.cloud/document/9f2c1b',
        name: '9f2c1b',
        type: 'application/octet-stream',
      }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.format).toBe('wav');
      expect(result.track.filename).toBe('Imported track.wav');
      expect(result.track.uri).toBe('file:///data/tracks/test-uuid-1234.wav');
    }
    // Staged under a neutral name first, then moved to its real one.
    expect(mockMove).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('identifies a bare mp3 frame with no tag in front of it', async () => {
    mockHeadBytes = MP3_FRAME;
    File.pickFileAsync.mockResolvedValue(
      pickedFile({
        uri: 'content://com.example.cloud/document/9f2c1b',
        name: '9f2c1b',
        type: 'application/octet-stream',
      }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.format).toBe('mp3');
    }
  });

  it('names the declared type when nothing else identifies the file', async () => {
    mockHeadBytes = null;
    File.pickFileAsync.mockResolvedValue(
      pickedFile({
        uri: 'content://com.example.cloud/document/9f2c1b',
        name: '9f2c1b',
        type: 'audio/flac',
      }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('unsupported_format');
      expect(result.message).toBe('Unsupported format: audio/flac');
    }
    // The copy made in order to read the header is not left behind.
    expect(mockDelete).toHaveBeenCalled();
  });

  it('never reports an empty format, even with no name and no type', async () => {
    mockHeadBytes = null;
    File.pickFileAsync.mockResolvedValue(
      pickedFile({
        uri: 'content://com.example.cloud/document/9f2c1b',
        name: '9f2c1b',
        type: '',
      }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Unsupported audio format');
      expect(result.message).not.toMatch(/:\s*$/);
    }
  });

  it('prefers the declared type over a name that disagrees', async () => {
    File.pickFileAsync.mockResolvedValue(
      pickedFile({
        uri: 'content://com.android.providers.media.documents/document/audio%3A7',
        name: 'audio:7.wav',
        type: 'audio/mp4',
      }),
    );

    const result = await pickAndImportFile();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.format).toBe('m4a');
    }
  });
});

describe('importFromUri', () => {
  it('returns file_not_found when the source is missing', async () => {
    mockFileExists = false;

    const result = await importFromUri('file:///missing.mp3', 'missing.mp3');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('file_not_found');
    }
  });

  it('imports a shared file by its filename', async () => {
    const result = await importFromUri('file:///shared/song.wav', 'song.wav');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.format).toBe('wav');
      expect(result.track.filename).toBe('song.wav');
    }
  });

  it('uses the type a share intent declares when the name carries none', async () => {
    const result = await importFromUri(
      'content://com.android.providers.media.documents/document/audio%3A55',
      'audio:55',
      'audio/aac',
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.format).toBe('aac');
      expect(result.track.filename).toBe('Imported track.aac');
    }
  });
});

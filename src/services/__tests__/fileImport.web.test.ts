/**
 * @jest-environment node
 */
const mockPutBlob = jest.fn<Promise<void>, [string, Blob]>();
const mockGetObjectUrl = jest.fn<Promise<string | null>, [string]>();

jest.mock('../webBlobStore.web', () => ({
  putBlob: (...args: [string, Blob]) => mockPutBlob(...args),
  getObjectUrl: (...args: [string]) => mockGetObjectUrl(...args),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'uuid-1'),
}));

import {
  importBlob,
  importFromUri,
  isSupportedFilename,
  pickAndImportFile,
} from '../fileImport.web';

function makeBlob(bytes = 1000): Blob {
  return { size: bytes, type: 'audio/mpeg' } as Blob;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPutBlob.mockResolvedValue(undefined);
  mockGetObjectUrl.mockResolvedValue('blob:obj/uuid-1');
});

describe('isSupportedFilename', () => {
  it.each([
    ['song.mp3', true],
    ['song.wav', true],
    ['song.aac', true],
    ['song.m4a', true],
    ['song.MP3', true],
    ['song.flac', false],
    ['noextension', false],
  ])('%s -> %s', (name, expected) => {
    expect(isSupportedFilename(name as string)).toBe(expected);
  });
});

describe('importBlob', () => {
  it('stores the blob and returns a playable track on success', async () => {
    const blob = makeBlob(2000);
    const result = await importBlob(blob, 'My Song.mp3', 2000);

    expect(mockPutBlob).toHaveBeenCalledWith('uuid-1', blob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track).toMatchObject({
        id: 'uuid-1',
        filename: 'My Song.mp3',
        uri: 'blob:obj/uuid-1',
        format: 'mp3',
        durationEstimated: true,
        fileSizeBytes: 2000,
      });
      expect(result.track.durationMs).toBeGreaterThan(0);
      expect(typeof result.track.importedAt).toBe('number');
    }
  });

  it('rejects an unsupported format before touching storage', async () => {
    const result = await importBlob(makeBlob(), 'clip.flac', 100);
    expect(result).toEqual({
      success: false,
      error: 'unsupported_format',
      message: expect.stringContaining('flac'),
    });
    expect(mockPutBlob).not.toHaveBeenCalled();
  });

  it('falls back to the sentinel uri when the object URL cannot be made', async () => {
    mockGetObjectUrl.mockResolvedValue(null);
    const result = await importBlob(makeBlob(), 'song.wav', 100);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.track.uri).toBe('idb://uuid-1');
    }
  });

  it('returns copy_failed when the blob cannot be stored', async () => {
    mockPutBlob.mockRejectedValue(new Error('quota exceeded'));
    const result = await importBlob(makeBlob(), 'song.mp3', 100);
    expect(result).toEqual({
      success: false,
      error: 'copy_failed',
      message: expect.any(String),
    });
  });
});

describe('importFromUri', () => {
  it('fetches the uri and imports the blob', async () => {
    const blob = makeBlob(500);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    }) as unknown as typeof fetch;

    const result = await importFromUri('blob:source', 'remote.aac');
    expect(result.success).toBe(true);
    expect(mockPutBlob).toHaveBeenCalledWith('uuid-1', blob);
  });

  it('returns file_not_found on a non-ok response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const result = await importFromUri('http://x/missing.mp3', 'missing.mp3');
    expect(result).toMatchObject({ success: false, error: 'file_not_found' });
  });

  it('returns file_not_found when the fetch throws', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    const result = await importFromUri('http://x/song.mp3', 'song.mp3');
    expect(result).toMatchObject({ success: false, error: 'file_not_found' });
  });
});

describe('pickAndImportFile', () => {
  // Minimal fake DOM input so the picker path can be exercised in node.
  function installFakeDom(file: File | null, event: 'change' | 'cancel') {
    const listeners: Record<string, () => void> = {};
    const input = {
      type: '',
      accept: '',
      style: { display: '' },
      files: file ? [file] : [],
      addEventListener: (name: string, cb: () => void) => {
        listeners[name] = cb;
      },
      remove: jest.fn(),
      click: () => {
        // Fire asynchronously, mirroring a real dialog.
        setTimeout(() => listeners[event]?.(), 0);
      },
    };
    (global as unknown as { document: unknown }).document = {
      createElement: jest.fn(() => input),
      body: { appendChild: jest.fn() },
    };
    return input;
  }

  it('imports the chosen file', async () => {
    const file = { name: 'picked.mp3', size: 1234 } as unknown as File;
    installFakeDom(file, 'change');

    const result = await pickAndImportFile();
    expect(result.success).toBe(true);
    expect(mockPutBlob).toHaveBeenCalledWith('uuid-1', file);
  });

  it('returns cancelled when the dialog is dismissed', async () => {
    installFakeDom(null, 'cancel');
    const result = await pickAndImportFile();
    expect(result).toMatchObject({ success: false, error: 'cancelled' });
    expect(mockPutBlob).not.toHaveBeenCalled();
  });
});

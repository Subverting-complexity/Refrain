import { createElement, StrictMode } from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useShareIntent } from '../useShareIntent';
import { Track } from '../../types';

const mockGetInitialURL = jest.fn<Promise<string | null>, []>();
const mockAddEventListener = jest.fn();
const mockRemove = jest.fn();

jest.mock('expo-linking', () => ({
  getInitialURL: () => mockGetInitialURL(),
  addEventListener: (event: string, cb: (e: { url: string }) => void) =>
    mockAddEventListener(event, cb),
}));

interface MockShareFile {
  path: string;
  fileName: string;
  mimeType: string;
  size: number | null;
}

interface MockShareState {
  hasShareIntent: boolean;
  files: MockShareFile[] | null;
  error: string | null;
}

let mockShareState: MockShareState;
const mockResetShareIntent = jest.fn();

jest.mock('expo-share-intent', () => ({
  useShareIntent: () => ({
    isReady: true,
    hasShareIntent: mockShareState.hasShareIntent,
    shareIntent: {
      files: mockShareState.files,
      text: null,
      webUrl: null,
      type: mockShareState.files ? 'file' : null,
    },
    resetShareIntent: mockResetShareIntent,
    error: mockShareState.error,
  }),
}));

const mockImportFromUri = jest.fn();
const mockIsSupportedFilename = jest.fn<boolean, [string]>();

jest.mock('../../services/fileImport', () => ({
  importFromUri: (uri: string, filename: string) =>
    mockImportFromUri(uri, filename),
  isSupportedFilename: (filename: string) => mockIsSupportedFilename(filename),
}));

const track: Track = {
  id: 'track-1',
  filename: 'song.mp3',
  uri: 'file:///data/tracks/track-1.mp3',
  format: 'mp3',
  durationMs: 42_000,
  durationEstimated: true,
  fileSizeBytes: 1_000_000,
  importedAt: 1_700_000_000_000,
};

const onTrackImported = jest.fn();
const onError = jest.fn();

function TestComponent() {
  useShareIntent({ onTrackImported, onError });
  return null;
}

async function renderHook(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(TestComponent));
  });
  return tree;
}

// Lets the getInitialURL promise and the chained importFromUri promise settle.
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function rerenderHook(tree: ReactTestRenderer): Promise<void> {
  await act(async () => {
    tree.update(createElement(TestComponent));
  });
}

function shareFile(overrides: Partial<MockShareFile> = {}): MockShareFile {
  return {
    path: 'file:///shared/song.mp3',
    fileName: 'song.mp3',
    mimeType: 'audio/mpeg',
    size: 1_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInitialURL.mockResolvedValue(null);
  mockAddEventListener.mockReturnValue({ remove: mockRemove });
  mockIsSupportedFilename.mockReturnValue(true);
  mockImportFromUri.mockResolvedValue({ success: true, track });
  // The web test below flips Platform.OS; reset it so suite order can't leak.
  Platform.OS = 'ios';
  mockShareState = { hasShareIntent: false, files: null, error: null };
  // Mirror the real library: resetting consumes the pending intent so the
  // next render reports no share.
  mockResetShareIntent.mockImplementation(() => {
    mockShareState = { ...mockShareState, hasShareIntent: false, files: null };
  });
});

describe('useShareIntent (expo-linking URL flow)', () => {
  it('imports a shared file URL from the initial launch URL', async () => {
    mockGetInitialURL.mockResolvedValue('file:///shared/song.mp3');

    await renderHook();

    expect(mockImportFromUri).toHaveBeenCalledWith(
      'file:///shared/song.mp3',
      'song.mp3',
    );
    expect(onTrackImported).toHaveBeenCalledWith(track);
    expect(onError).not.toHaveBeenCalled();
  });

  it('imports a shared content:// URL delivered via the url event', async () => {
    await renderHook();

    const listener = mockAddEventListener.mock.calls[0][1];
    await act(async () => {
      listener({ url: 'content://downloads/song.mp3' });
    });

    expect(mockImportFromUri).toHaveBeenCalledWith(
      'content://downloads/song.mp3',
      'song.mp3',
    );
    expect(onTrackImported).toHaveBeenCalledWith(track);
  });

  it('silently ignores app-scheme deep links (no spurious error)', async () => {
    mockGetInitialURL.mockResolvedValue('exp://192.168.0.10:8081');

    await renderHook();

    const listener = mockAddEventListener.mock.calls[0][1];
    await act(async () => {
      listener({ url: 'refrain://player?trackId=abc' });
    });

    expect(mockImportFromUri).not.toHaveBeenCalled();
    expect(onTrackImported).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('silently ignores the share-extension dataUrl redirect link', async () => {
    mockGetInitialURL.mockResolvedValue(
      'refrain://dataUrl=refrainShareKey#text',
    );

    await renderHook();

    expect(mockImportFromUri).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an unsupported extension on a shared file URL', async () => {
    mockIsSupportedFilename.mockReturnValue(false);
    mockGetInitialURL.mockResolvedValue('file:///shared/notes.txt');

    await renderHook();

    expect(mockImportFromUri).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Unsupported audio format');
  });

  it('reports a failed import', async () => {
    mockImportFromUri.mockResolvedValue({
      success: false,
      error: 'copy-failed',
      message: 'Could not copy file',
    });
    mockGetInitialURL.mockResolvedValue('file:///shared/song.mp3');

    await renderHook();

    expect(onTrackImported).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Could not copy file');
  });

  it('imports a given initial URL once even when the mount effect runs twice', async () => {
    mockGetInitialURL.mockResolvedValue('file:///shared/song.mp3');

    // StrictMode double-invokes the mount effect in dev (mount → cleanup →
    // mount), reproducing the duplicate-import path the guard defends against.
    await act(async () => {
      create(createElement(StrictMode, null, createElement(TestComponent)));
    });
    await flushMicrotasks();

    // The effect ran more than once, so the shared link was resolved twice...
    expect(mockGetInitialURL.mock.calls.length).toBeGreaterThan(1);
    // ...but the guard let it import only once.
    expect(mockImportFromUri).toHaveBeenCalledTimes(1);
    expect(onTrackImported).toHaveBeenCalledTimes(1);
  });

  it('still imports each foreground share that arrives via the url event', async () => {
    await renderHook();

    const listener = mockAddEventListener.mock.calls[0][1];
    await act(async () => {
      listener({ url: 'file:///shared/first.mp3' });
    });
    await flushMicrotasks();
    await act(async () => {
      listener({ url: 'file:///shared/second.mp3' });
    });
    await flushMicrotasks();

    expect(mockImportFromUri).toHaveBeenCalledTimes(2);
    expect(onTrackImported).toHaveBeenCalledTimes(2);
  });

  it('does nothing on web', async () => {
    Platform.OS = 'web';
    mockGetInitialURL.mockResolvedValue('file:///shared/song.mp3');

    await renderHook();
    await flushMicrotasks();

    expect(mockGetInitialURL).not.toHaveBeenCalled();
    expect(mockImportFromUri).not.toHaveBeenCalled();
  });

  it('removes the url listener on unmount', async () => {
    const tree = await renderHook();

    act(() => {
      tree.unmount();
    });

    expect(mockRemove).toHaveBeenCalled();
  });
});

describe('useShareIntent (system share sheet flow)', () => {
  it('imports a file delivered via the share sheet', async () => {
    mockShareState = {
      hasShareIntent: true,
      files: [shareFile()],
      error: null,
    };

    await renderHook();

    expect(mockImportFromUri).toHaveBeenCalledWith(
      'file:///shared/song.mp3',
      'song.mp3',
    );
    expect(onTrackImported).toHaveBeenCalledWith(track);
    expect(mockResetShareIntent).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('consumes the intent before importing (double-import guard)', async () => {
    mockShareState = {
      hasShareIntent: true,
      files: [shareFile()],
      error: null,
    };

    await renderHook();

    expect(mockResetShareIntent.mock.invocationCallOrder[0]).toBeLessThan(
      mockImportFromUri.mock.invocationCallOrder[0],
    );
  });

  it('does not re-import the same intent on re-render', async () => {
    mockShareState = {
      hasShareIntent: true,
      files: [shareFile()],
      error: null,
    };

    const tree = await renderHook();
    await rerenderHook(tree);
    await rerenderHook(tree);

    expect(mockImportFromUri).toHaveBeenCalledTimes(1);
    expect(onTrackImported).toHaveBeenCalledTimes(1);
  });

  it('imports an intent that arrives after mount', async () => {
    const tree = await renderHook();
    expect(mockImportFromUri).not.toHaveBeenCalled();

    mockShareState = {
      hasShareIntent: true,
      files: [shareFile({ path: 'content://media/42/song.m4a' })],
      error: null,
    };
    await rerenderHook(tree);

    expect(mockImportFromUri).toHaveBeenCalledWith(
      'content://media/42/song.m4a',
      'song.mp3',
    );
    expect(onTrackImported).toHaveBeenCalledWith(track);
  });

  it('imports every file of a multi-file share', async () => {
    mockShareState = {
      hasShareIntent: true,
      files: [
        shareFile(),
        shareFile({ path: 'file:///shared/other.wav', fileName: 'other.wav' }),
      ],
      error: null,
    };

    await renderHook();

    expect(mockImportFromUri).toHaveBeenCalledTimes(2);
    expect(mockImportFromUri).toHaveBeenCalledWith(
      'file:///shared/other.wav',
      'other.wav',
    );
    expect(onTrackImported).toHaveBeenCalledTimes(2);
  });

  it('falls back to the path-derived filename when fileName is empty', async () => {
    mockShareState = {
      hasShareIntent: true,
      files: [
        shareFile({ path: 'content://media/123/song.m4a', fileName: '' }),
      ],
      error: null,
    };

    await renderHook();

    expect(mockImportFromUri).toHaveBeenCalledWith(
      'content://media/123/song.m4a',
      'song.m4a',
    );
  });

  it('reports an unsupported shared file and still consumes the intent', async () => {
    mockIsSupportedFilename.mockReturnValue(false);
    mockShareState = {
      hasShareIntent: true,
      files: [shareFile({ fileName: 'notes.txt' })],
      error: null,
    };

    await renderHook();

    expect(mockImportFromUri).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Unsupported audio format');
    expect(mockResetShareIntent).toHaveBeenCalled();
  });

  it('reports a failed share-sheet import', async () => {
    mockImportFromUri.mockResolvedValue({
      success: false,
      error: 'copy-failed',
      message: 'Could not copy file',
    });
    mockShareState = {
      hasShareIntent: true,
      files: [shareFile()],
      error: null,
    };

    await renderHook();

    expect(onTrackImported).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Could not copy file');
  });

  it('ignores a share intent without files (e.g. shared text)', async () => {
    mockShareState = { hasShareIntent: true, files: null, error: null };

    await renderHook();

    expect(mockImportFromUri).not.toHaveBeenCalled();
    expect(onTrackImported).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(mockResetShareIntent).toHaveBeenCalled();
  });

  it('surfaces a native share-intent error', async () => {
    mockShareState = {
      hasShareIntent: false,
      files: null,
      error: 'Native share processing failed',
    };

    await renderHook();

    expect(onError).toHaveBeenCalledWith('Native share processing failed');
    expect(mockImportFromUri).not.toHaveBeenCalled();
  });
});

// `importFromUri` resolves to an outcome for the failures it anticipates, but
// the native path builds an expo-file-system `File` and reads `.exists` before
// its own try/catch, so a malformed shared path throws outright. Every call
// site here is fire-and-forget, so an escaping rejection would be unhandled
// rather than reported through onError.
describe('useShareIntent (import throws rather than resolving)', () => {
  it('reports a throwing share-sheet import through onError', async () => {
    mockImportFromUri.mockRejectedValue(new Error('Invalid file URI'));
    mockShareState = {
      hasShareIntent: true,
      files: [shareFile()],
      error: null,
    };

    await renderHook();
    await flushMicrotasks();

    expect(onError).toHaveBeenCalledWith('Invalid file URI');
    expect(onTrackImported).not.toHaveBeenCalled();
  });

  it('keeps importing the remaining files after one throws', async () => {
    mockImportFromUri
      .mockRejectedValueOnce(new Error('Invalid file URI'))
      .mockResolvedValueOnce({ success: true, track });
    mockShareState = {
      hasShareIntent: true,
      files: [
        shareFile({ path: 'file:///shared/bad.mp3', fileName: 'bad.mp3' }),
        shareFile({ path: 'file:///shared/good.mp3', fileName: 'good.mp3' }),
      ],
      error: null,
    };

    await renderHook();
    await flushMicrotasks();

    expect(onError).toHaveBeenCalledWith('Invalid file URI');
    expect(mockImportFromUri).toHaveBeenCalledWith(
      'file:///shared/good.mp3',
      'good.mp3',
    );
    expect(onTrackImported).toHaveBeenCalledWith(track);
  });

  it('reports a throwing initial-URL import through onError', async () => {
    mockGetInitialURL.mockResolvedValue('file:///shared/song.mp3');
    mockImportFromUri.mockRejectedValue(new Error('Invalid file URI'));

    await renderHook();
    await flushMicrotasks();

    expect(onError).toHaveBeenCalledWith('Invalid file URI');
    expect(onTrackImported).not.toHaveBeenCalled();
  });

  it('reports a throwing url-event import through onError', async () => {
    mockImportFromUri.mockRejectedValue(new Error('Invalid file URI'));

    await renderHook();
    const listener = mockAddEventListener.mock.calls[0][1];
    await act(async () => {
      listener({ url: 'content://downloads/song.mp3' });
    });
    await flushMicrotasks();

    expect(onError).toHaveBeenCalledWith('Invalid file URI');
    expect(onTrackImported).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for a non-Error throw', async () => {
    mockImportFromUri.mockRejectedValue({ code: 'EUNKNOWN' });
    mockShareState = {
      hasShareIntent: true,
      files: [shareFile()],
      error: null,
    };

    await renderHook();
    await flushMicrotasks();

    expect(onError).toHaveBeenCalledWith('Unknown error');
  });

  it('survives getInitialURL itself rejecting', async () => {
    mockGetInitialURL.mockRejectedValue(new Error('Linking unavailable'));

    await renderHook();
    await flushMicrotasks();

    // Nothing was shared, so there is nothing to report — but the rejection
    // must not escape as an unhandled promise rejection either.
    expect(mockImportFromUri).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

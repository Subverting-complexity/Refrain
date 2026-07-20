import { createElement } from 'react';
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInitialURL.mockResolvedValue(null);
  mockAddEventListener.mockReturnValue({ remove: mockRemove });
  mockIsSupportedFilename.mockReturnValue(true);
  mockImportFromUri.mockResolvedValue({ success: true, track });
});

describe('useShareIntent', () => {
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

  it('removes the url listener on unmount', async () => {
    const tree = await renderHook();

    act(() => {
      tree.unmount();
    });

    expect(mockRemove).toHaveBeenCalled();
  });
});

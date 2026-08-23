import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useTrackImport, UseTrackImportOptions } from '../useTrackImport';
import { pickAndImportFile } from '../../services/fileImport';
import { insertTrack } from '../../services/trackStore';
import { Track } from '../../types';

jest.mock('../../services/fileImport', () => ({
  pickAndImportFile: jest.fn(),
}));

jest.mock('../../services/trackStore', () => ({
  insertTrack: jest.fn(),
}));

interface CapturedShareOptions {
  enabled?: boolean;
  onTrackImported: (track: Track) => void;
  onError?: (message: string) => void;
}

let shareOptions: CapturedShareOptions;
jest.mock('../useShareIntent', () => ({
  useShareIntent: (options: CapturedShareOptions) => {
    shareOptions = options;
  },
}));

const mockPickAndImportFile = pickAndImportFile as jest.MockedFunction<
  typeof pickAndImportFile
>;
const mockInsertTrack = insertTrack as jest.MockedFunction<typeof insertTrack>;

const track: Track = {
  id: 'track-1',
  filename: 'riff.mp3',
  uri: 'file:///riff.mp3',
  format: 'mp3',
  durationMs: 1000,
  durationEstimated: false,
  fileSizeBytes: 2048,
  importedAt: 0,
  folderId: null,
  isFavorite: false,
  lastPlayedAt: null,
};

const onImported = jest.fn();
const showToast = jest.fn();

let result: ReturnType<typeof useTrackImport>;

function TestComponent(props: Omit<UseTrackImportOptions, 'onImported'>) {
  result = useTrackImport({ ...props, onImported, showToast });
  return null;
}

async function renderHook(
  props: Partial<Omit<UseTrackImportOptions, 'onImported'>> = {},
): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      createElement(TestComponent, {
        destinationFolderId: null,
        destinationName: 'Unfiled',
        showToast,
        ...props,
      }),
    );
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useTrackImport via the file picker', () => {
  it('files the track into the destination and names it', async () => {
    mockPickAndImportFile.mockResolvedValueOnce({ success: true, track });
    const tree = await renderHook({
      destinationFolderId: 'f-1',
      destinationName: 'Scales',
    });

    await act(async () => {
      result.handleImport();
    });

    expect(mockInsertTrack).toHaveBeenCalledWith({ ...track, folderId: 'f-1' });
    expect(onImported).toHaveBeenCalledWith({ ...track, folderId: 'f-1' });
    expect(showToast).toHaveBeenCalledWith(
      'Imported riff.mp3 to Scales',
      'success',
    );
    act(() => tree.unmount());
  });

  it('files into Unfiled when there is no destination folder', async () => {
    mockPickAndImportFile.mockResolvedValueOnce({
      success: true,
      track: { ...track, folderId: 'stale' },
    });
    const tree = await renderHook();

    await act(async () => {
      result.handleImport();
    });

    expect(mockInsertTrack).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null }),
    );
    expect(showToast).toHaveBeenCalledWith(
      'Imported riff.mp3 to Unfiled',
      'success',
    );
    act(() => tree.unmount());
  });

  // Backing out of the system picker is not a failure and should say nothing.
  it('says nothing when the reader cancels the picker', async () => {
    mockPickAndImportFile.mockResolvedValueOnce({
      success: false,
      error: 'cancelled',
      message: 'Cancelled',
    });
    const tree = await renderHook();

    await act(async () => {
      result.handleImport();
    });

    expect(showToast).not.toHaveBeenCalled();
    expect(mockInsertTrack).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('reports an import that failed', async () => {
    mockPickAndImportFile.mockResolvedValueOnce({
      success: false,
      error: 'unsupported_format',
      message: 'Unsupported file format',
    });
    const tree = await renderHook();

    await act(async () => {
      result.handleImport();
    });

    expect(showToast).toHaveBeenCalledWith(
      'Import failed: Unsupported file format',
      'error',
    );
    act(() => tree.unmount());
  });

  it('reports a picker that threw', async () => {
    mockPickAndImportFile.mockRejectedValueOnce(new Error('picker exploded'));
    const tree = await renderHook();

    await act(async () => {
      result.handleImport();
    });

    expect(showToast).toHaveBeenCalledWith(
      'Import failed: picker exploded',
      'error',
    );
    act(() => tree.unmount());
  });

  // A track the store refused to keep is not imported, however far the copy
  // got, so the caller must not be told to show it.
  it('reports a save failure instead of a success', async () => {
    mockPickAndImportFile.mockResolvedValueOnce({ success: true, track });
    mockInsertTrack.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const tree = await renderHook();

    await act(async () => {
      result.handleImport();
    });

    expect(showToast).toHaveBeenCalledWith(
      'Failed to save track to library',
      'error',
    );
    expect(showToast).not.toHaveBeenCalledWith(
      'Imported riff.mp3 to Unfiled',
      'success',
    );
    expect(onImported).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    act(() => tree.unmount());
  });
});

describe('useTrackImport via the system share sheet', () => {
  it('files a shared track into the same destination and names it', async () => {
    const tree = await renderHook({
      destinationFolderId: 'f-1',
      destinationName: 'Scales',
    });

    await act(async () => {
      await shareOptions.onTrackImported(track);
    });

    expect(mockInsertTrack).toHaveBeenCalledWith({ ...track, folderId: 'f-1' });
    expect(showToast).toHaveBeenCalledWith(
      'Received riff.mp3 into Scales',
      'success',
    );
    act(() => tree.unmount());
  });

  it('reports a share that failed', async () => {
    const tree = await renderHook();

    act(() => {
      shareOptions.onError?.('Unsupported audio format');
    });

    expect(showToast).toHaveBeenCalledWith(
      'Share import failed: Unsupported audio format',
      'error',
    );
    act(() => tree.unmount());
  });

  // Two library screens are mounted at once once a folder is open, so the
  // caller decides which of them listens.
  it('passes the caller’s share gate straight through', async () => {
    const tree = await renderHook({ shareEnabled: false });
    expect(shareOptions.enabled).toBe(false);
    act(() => tree.unmount());

    const enabled = await renderHook({ shareEnabled: true });
    expect(shareOptions.enabled).toBe(true);
    act(() => enabled.unmount());
  });

  it('listens by default', async () => {
    const tree = await renderHook();
    expect(shareOptions.enabled).toBe(true);
    act(() => tree.unmount());
  });
});

describe('useTrackImport handleImport', () => {
  it('imports and files the chosen track', async () => {
    mockPickAndImportFile.mockResolvedValueOnce({ success: true, track });
    const tree = await renderHook({
      destinationFolderId: 'f-1',
      destinationName: 'Scales',
    });

    await act(async () => {
      result.handleImport();
    });

    expect(mockInsertTrack).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      'Imported riff.mp3 to Scales',
      'success',
    );
    act(() => tree.unmount());
  });

  // The hook deliberately does not expose the awaitable form: nothing a
  // caller could do with the outcome, since every failure is already a toast.
  it('returns nothing to await, so a press handler cannot float a promise', async () => {
    mockPickAndImportFile.mockResolvedValueOnce({
      success: false,
      error: 'cancelled',
      message: 'File selection cancelled',
    });
    const tree = await renderHook();

    let returned: unknown = 'unset';
    await act(async () => {
      returned = result.handleImport();
    });

    expect(returned).toBeUndefined();
    act(() => tree.unmount());
  });

  it('stays stable across renders so it can be a dependency', async () => {
    const tree = await renderHook();
    const first = result.handleImport;

    await act(async () => {
      tree.update(
        createElement(TestComponent, {
          destinationFolderId: null,
          destinationName: 'Unfiled',
          showToast,
        }),
      );
    });

    expect(result.handleImport).toBe(first);
    act(() => tree.unmount());
  });
});

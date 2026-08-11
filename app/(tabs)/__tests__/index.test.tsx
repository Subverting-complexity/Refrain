import React from 'react';
import { AccessibilityInfo, FlatList } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import LibraryScreen from '../index';
import { pickAndImportFile } from '@/src/services/fileImport';
import {
  deleteTrack,
  insertTrack,
  loadTracks,
} from '@/src/services/trackStore';
import { Track } from '@/src/types';

jest.mock('@/src/services/trackStore', () => ({
  loadTracks: jest.fn(),
  insertTrack: jest.fn(),
  deleteTrack: jest.fn(),
}));

jest.mock('@/src/services/fileImport', () => ({
  pickAndImportFile: jest.fn(),
}));

jest.mock('@/src/hooks/useShareIntent', () => ({
  useShareIntent: jest.fn(),
}));

jest.mock('@/src/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#000',
        surface: '#111',
        accent: '#0f0',
        accentText: '#000',
        textPrimary: '#fff',
        error: '#f00',
      },
      typography: { heading: {}, body: {}, bodySmall: {}, caption: {} },
    },
  }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    // Return the callback's result so its cleanup runs on blur/unmount, as
    // the real useFocusEffect does — the screen relies on it to cancel an
    // in-flight library load.
    useFocusEffect: (cb: () => void | (() => void)) => {
      ReactLocal.useEffect(cb, [cb]);
    },
    useRouter: () => ({ push: mockPush }),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@/src/components/ImportButton', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    ImportButton: ({ onPress }: { onPress: () => void }) =>
      ReactLocal.createElement(View, { testID: 'import-button', onPress }),
  };
});

jest.mock('@/src/components/TrackListItem', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    TrackListItem: ({
      track,
      onPress,
      onDelete,
    }: {
      track: { id: string };
      onPress: (track: unknown) => void;
      onDelete: (id: string) => void;
    }) =>
      ReactLocal.createElement(View, {
        testID: 'track-item',
        onPress: () => onPress(track),
        onDelete: () => onDelete(track.id),
      }),
  };
});

const mockLoadTracks = loadTracks as jest.MockedFunction<typeof loadTracks>;
const mockDeleteTrack = deleteTrack as jest.MockedFunction<typeof deleteTrack>;
const mockInsertTrack = insertTrack as jest.MockedFunction<typeof insertTrack>;
const mockPickAndImportFile = pickAndImportFile as jest.MockedFunction<
  typeof pickAndImportFile
>;

const sampleTrack: Track = {
  id: 'track-1',
  filename: 'song.mp3',
  uri: 'file:///song.mp3',
  format: 'mp3',
  durationMs: 1000,
  durationEstimated: false,
  fileSizeBytes: 2048,
  importedAt: 0,
};

async function renderScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<LibraryScreen />);
  });
  return renderer;
}

describe('LibraryScreen load/refresh failure announcements', () => {
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    announceSpy.mockRestore();
  });

  it('announces a failure when the initial load rejects', async () => {
    mockLoadTracks.mockRejectedValueOnce(new Error('db read failed'));

    const renderer = await renderScreen();

    expect(announceSpy).toHaveBeenCalledWith('Failed to load library');
    act(() => renderer.unmount());
  });

  it('does not announce a failure when the initial load succeeds', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);

    const renderer = await renderScreen();

    expect(announceSpy).not.toHaveBeenCalledWith('Failed to load library');
    act(() => renderer.unmount());
  });

  it('does not report a load failure that lands after the screen has blurred', async () => {
    // The focus effect cancels on blur: refocusing starts a fresh load, so a
    // slow earlier one settling afterwards must neither clobber the newer
    // list nor announce into whatever screen the user is now on.
    let rejectLoad!: (error: Error) => void;
    mockLoadTracks.mockReturnValueOnce(
      new Promise<Track[]>((_resolve, reject) => {
        rejectLoad = reject;
      }),
    );

    const renderer = await renderScreen();
    act(() => renderer.unmount());

    await act(async () => {
      rejectLoad(new Error('db read failed'));
      await Promise.resolve();
    });

    expect(announceSpy).not.toHaveBeenCalledWith('Failed to load library');
  });

  it('announces a failure when pull-to-refresh rejects', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    mockLoadTracks.mockRejectedValueOnce(new Error('db read failed'));
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;

    await act(async () => {
      await onRefresh();
    });

    expect(announceSpy).toHaveBeenCalledWith('Failed to refresh library');
    expect(announceSpy).not.toHaveBeenCalledWith('Library refreshed');
    act(() => renderer.unmount());
  });

  it('announces success when pull-to-refresh succeeds', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;

    await act(async () => {
      await onRefresh();
    });

    expect(announceSpy).toHaveBeenCalledWith('Library refreshed');
    expect(announceSpy).not.toHaveBeenCalledWith('Failed to refresh library');
    act(() => renderer.unmount());
  });
});

describe('LibraryScreen stale-load guard', () => {
  beforeEach(() => {
    // These tests control load timing precisely, so drain any queued `...Once`
    // implementations left by earlier blocks (clearAllMocks resets call
    // records but not the implementation queue), and make every unstaged load
    // hang so only the load a test stages can settle.
    mockLoadTracks.mockReset();
    mockInsertTrack.mockReset();
    mockDeleteTrack.mockReset();
    mockPickAndImportFile.mockReset();
    mockLoadTracks.mockReturnValue(new Promise<Track[]>(() => {}));
  });

  // Read the list straight off the FlatList's `data` prop. Counting rendered
  // nodes double-counts (each mocked item is a composite plus a host element),
  // and the empty state renders no FlatList at all.
  function trackIds(renderer: ReactTestRenderer): string[] {
    const lists = renderer.root.findAllByType(FlatList);
    if (lists.length === 0) return [];
    return (lists[0].props.data as Track[]).map((t) => t.id);
  }

  it('keeps an optimistically added track when a load in flight since before the import resolves', async () => {
    // The blur-scoped guard does not cover this: the screen never blurred.
    // The read simply started before the track existed, so its snapshot
    // predates the import and applying it drops the new track.
    let resolveLoad!: (tracks: Track[]) => void;
    mockLoadTracks.mockReturnValueOnce(
      new Promise<Track[]>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const renderer = await renderScreen();

    mockPickAndImportFile.mockResolvedValueOnce({
      success: true,
      track: sampleTrack,
    });
    mockInsertTrack.mockResolvedValueOnce(undefined as never);

    const importButton = renderer.root.findAllByProps({
      testID: 'import-button',
    })[0];
    await act(async () => {
      await importButton.props.onPress();
    });
    expect(trackIds(renderer)).toEqual(['track-1']);

    // The stale read finally lands, reporting the library as it was before.
    await act(async () => {
      resolveLoad([]);
    });

    expect(trackIds(renderer)).toEqual(['track-1']);
    act(() => renderer.unmount());
  });

  it('does not resurrect a deleted track when an older load resolves', async () => {
    let resolveLoad!: (tracks: Track[]) => void;
    mockLoadTracks
      .mockReturnValueOnce(Promise.resolve([sampleTrack]))
      .mockReturnValueOnce(
        new Promise<Track[]>((resolve) => {
          resolveLoad = resolve;
        }),
      );

    const renderer = await renderScreen();
    expect(trackIds(renderer)).toEqual(['track-1']);

    // A refresh is in flight when the user deletes the track.
    mockDeleteTrack.mockResolvedValueOnce(undefined as never);
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;
    let refreshDone!: Promise<void>;
    await act(async () => {
      refreshDone = onRefresh();
    });

    const item = renderer.root.findAllByProps({ testID: 'track-item' })[0];
    await act(async () => {
      await item.props.onDelete();
    });
    expect(trackIds(renderer)).toEqual([]);

    await act(async () => {
      resolveLoad([sampleTrack]);
      await refreshDone;
    });

    expect(trackIds(renderer)).toEqual([]);
    act(() => renderer.unmount());
  });
});

describe('LibraryScreen visible toast feedback', () => {
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    announceSpy.mockRestore();
  });

  function toastLabels(renderer: ReactTestRenderer): string[] {
    return renderer.root
      .findAllByProps({ accessibilityRole: 'alert' })
      .map((node) => node.props.accessibilityLabel);
  }

  it('shows a visible toast when the initial load fails', async () => {
    mockLoadTracks.mockRejectedValueOnce(new Error('db read failed'));

    const renderer = await renderScreen();

    expect(toastLabels(renderer)).toContain('Failed to load library');
    act(() => renderer.unmount());
  });

  it('shows a visible toast when an import fails', async () => {
    mockLoadTracks.mockResolvedValueOnce([]);
    const renderer = await renderScreen();

    mockPickAndImportFile.mockResolvedValueOnce({
      success: false,
      error: 'unsupported_format',
      message: 'Unsupported file format',
    });
    const importButton = renderer.root.findByProps({ testID: 'import-button' });

    await act(async () => {
      await importButton.props.onPress();
    });

    expect(toastLabels(renderer)).toContain(
      'Import failed: Unsupported file format',
    );
    act(() => renderer.unmount());
  });

  it('reports a save failure (not success) when the import persist throws', async () => {
    mockLoadTracks.mockResolvedValueOnce([]);
    const renderer = await renderScreen();

    mockPickAndImportFile.mockResolvedValueOnce({
      success: true,
      track: sampleTrack,
    });
    mockInsertTrack.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });
    const importButton = renderer.root.findByProps({ testID: 'import-button' });

    await act(async () => {
      await importButton.props.onPress();
    });

    const labels = toastLabels(renderer);
    expect(labels).toContain('Failed to save track to library');
    expect(labels).not.toContain('Imported song.mp3 successfully');
    act(() => renderer.unmount());
  });

  it('shows a visible toast when a delete fails', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    mockDeleteTrack.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });
    const trackItem = renderer.root.findByProps({ testID: 'track-item' });

    await act(async () => {
      await trackItem.props.onDelete();
    });

    expect(toastLabels(renderer)).toContain('Failed to delete track');
    act(() => renderer.unmount());
  });

  it('shows a visible toast when a delete succeeds', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    const trackItem = renderer.root.findByProps({ testID: 'track-item' });

    await act(async () => {
      await trackItem.props.onDelete();
    });

    expect(toastLabels(renderer)).toContain('Track deleted');
    act(() => renderer.unmount());
  });
});

describe('LibraryScreen navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // The uri is deliberately left out of the route: on web it is a `blob:`
  // object URL that dies with the document, so a route carrying one broke on
  // reload. The player re-resolves it from the track id instead.
  it('navigates to the player by track id, without the volatile uri', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    const trackItem = renderer.root.findByProps({ testID: 'track-item' });
    await act(async () => {
      trackItem.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/player',
      params: { filename: 'song.mp3', trackId: 'track-1' },
    });
    const [{ params }] = mockPush.mock.calls[0] as [
      { params: Record<string, unknown> },
    ];
    expect(params).not.toHaveProperty('uri');

    act(() => renderer.unmount());
  });
});

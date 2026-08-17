import React from 'react';
import { AccessibilityInfo, FlatList } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import LibraryScreen from '../index';
import { pickAndImportFile } from '@/src/services/fileImport';
import {
  deleteTrack,
  insertTrack,
  loadTracks,
  renameTrack,
} from '@/src/services/trackStore';
import { Track } from '@/src/types';

jest.mock('@/src/services/trackStore', () => ({
  loadTracks: jest.fn(),
  insertTrack: jest.fn(),
  deleteTrack: jest.fn(),
  renameTrack: jest.fn(),
  moveTrackToFolder: jest.fn(),
  updateTrackSortOrder: jest.fn(),
}));

jest.mock('@/src/services/folderStore', () => ({
  loadFolders: jest.fn().mockResolvedValue([]),
  insertFolder: jest.fn(),
  deleteFolder: jest.fn(),
  renameFolder: jest.fn(),
}));

jest.mock('@/src/services/settingsStore', () => ({
  getSetting: jest.fn().mockReturnValue(null),
  setSetting: jest.fn(),
}));

jest.mock('@/src/utils/generateId', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid'),
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

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: (props: Record<string, unknown>) => <View {...props} /> };
});

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
      onRename,
      onDelete,
    }: {
      track: { id: string };
      onPress: (track: unknown) => void;
      onRename: (id: string, filename: string) => void;
      onDelete: (id: string) => void;
    }) =>
      ReactLocal.createElement(View, {
        testID: 'track-item',
        onPress: () => onPress(track),
        onDelete: () => onDelete(track.id),
        onRename: (filename: string) => onRename(track.id, filename),
      }),
  };
});

jest.mock('@/src/components/FolderListItem', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    FolderListItem: () =>
      ReactLocal.createElement(View, { testID: 'folder-item' }),
  };
});

jest.mock('@/src/components/SearchBar', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    SearchBar: () => ReactLocal.createElement(View, { testID: 'search-bar' }),
  };
});

jest.mock('@/src/components/SortPicker', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    SortPicker: () => ReactLocal.createElement(View, { testID: 'sort-picker' }),
  };
});

jest.mock('@/src/components/CreateFolderDialog', () => ({
  CreateFolderDialog: () => null,
}));

jest.mock('@/src/components/TrackRenameDialog', () => ({
  TrackRenameDialog: () => null,
}));

jest.mock('@/src/components/NameEntryDialog', () => ({
  NameEntryDialog: () => null,
}));

jest.mock('@/src/components/TrackActionsSheet', () => ({
  TrackActionsSheet: () => null,
}));

jest.mock('@/src/components/FolderPickerDialog', () => ({
  FolderPickerDialog: () => null,
}));

const mockLoadTracks = loadTracks as jest.MockedFunction<typeof loadTracks>;
const mockDeleteTrack = deleteTrack as jest.MockedFunction<typeof deleteTrack>;
const mockInsertTrack = insertTrack as jest.MockedFunction<typeof insertTrack>;
const mockRenameTrack = renameTrack as jest.MockedFunction<typeof renameTrack>;
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
  folderId: null,
  sortOrder: 0,
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
    mockRenameTrack.mockReset();
    mockPickAndImportFile.mockReset();
    mockLoadTracks.mockReturnValue(new Promise<Track[]>(() => {}));
  });

  // Read the list straight off the FlatList's `data` prop. The data is now
  // a ListItem[] union — extract track ids from track items only.
  function trackIds(renderer: ReactTestRenderer): string[] {
    const lists = renderer.root.findAllByType(FlatList);
    if (lists.length === 0) return [];
    return (lists[0].props.data as { type: string; track?: Track }[])
      .filter((item) => item.type === 'track')
      .map((item) => item.track!.id);
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

  it('shows a visible toast when a rename succeeds', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    const trackItem = renderer.root.findByProps({ testID: 'track-item' });

    await act(async () => {
      await trackItem.props.onRename('Practice take.mp3');
    });

    expect(mockRenameTrack).toHaveBeenCalledWith(
      'track-1',
      'Practice take.mp3',
    );
    expect(toastLabels(renderer)).toContain('Renamed to Practice take.mp3');
    act(() => renderer.unmount());
  });

  it('shows a visible toast when a rename fails', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    mockRenameTrack.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });
    const trackItem = renderer.root.findByProps({ testID: 'track-item' });

    await act(async () => {
      await trackItem.props.onRename('Practice take.mp3');
    });

    expect(toastLabels(renderer)).toContain('Failed to rename track');
    act(() => renderer.unmount());
  });
});

describe('LibraryScreen rename keeps the rest of the row intact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function listedTracks(renderer: ReactTestRenderer): Track[] {
    return renderer.root.findByType(FlatList).props.data as Track[];
  }

  // Rebuilding the entry from anything but the previous one is the one place a
  // rename could quietly drop the duration, format, size or import time the
  // store just took care to preserve.
  it('patches only the filename on the listed track', async () => {
    const measured: Track = {
      ...sampleTrack,
      durationMs: 187_000,
      durationEstimated: false,
      fileSizeBytes: 5_242_880,
      importedAt: 1_700_000_000_000,
    };
    mockLoadTracks.mockResolvedValueOnce([measured]);
    const renderer = await renderScreen();

    const trackItem = renderer.root.findByProps({ testID: 'track-item' });
    await act(async () => {
      await trackItem.props.onRename('Practice take.mp3');
    });

    expect(listedTracks(renderer)).toEqual([
      { ...measured, filename: 'Practice take.mp3' },
    ]);
    act(() => renderer.unmount());
  });

  it('leaves other tracks in the list untouched', async () => {
    const other: Track = { ...sampleTrack, id: 'track-2', filename: 'b.wav' };
    mockLoadTracks.mockResolvedValueOnce([sampleTrack, other]);
    const renderer = await renderScreen();

    const trackItems = renderer.root.findAllByProps({ testID: 'track-item' });
    await act(async () => {
      await trackItems[0].props.onRename('Practice take.mp3');
    });

    expect(listedTracks(renderer)).toEqual([
      { ...sampleTrack, filename: 'Practice take.mp3' },
      other,
    ]);
    act(() => renderer.unmount());
  });

  // Same hazard the import and delete paths guard against: a read that started
  // before the rename would otherwise land afterwards and restore the old name.
  it('does not let a load in flight since before the rename restore the old name', async () => {
    let resolveLoad!: (tracks: Track[]) => void;
    mockLoadTracks
      // The focus read settles immediately, seeding the list...
      .mockReturnValueOnce(Promise.resolve([sampleTrack]))
      // ...then a refresh read is left in flight across the rename.
      .mockReturnValueOnce(
        new Promise<Track[]>((resolve) => {
          resolveLoad = resolve;
        }),
      );
    const renderer = await renderScreen();

    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;
    let refreshDone!: Promise<void>;
    await act(async () => {
      refreshDone = onRefresh();
    });

    const trackItem = renderer.root.findByProps({ testID: 'track-item' });
    await act(async () => {
      await trackItem.props.onRename('Practice take.mp3');
    });

    await act(async () => {
      resolveLoad([sampleTrack]);
      await refreshDone;
    });

    expect(listedTracks(renderer).map((t) => t.filename)).toEqual([
      'Practice take.mp3',
    ]);
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

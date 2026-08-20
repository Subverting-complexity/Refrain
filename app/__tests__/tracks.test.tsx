import React from 'react';
import { AccessibilityInfo, FlatList } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import TracksScreen from '../tracks';
import { pickAndImportFile } from '@/src/services/fileImport';
import { insertFolder, markFolderOpened } from '@/src/services/folderStore';
import {
  deleteTrack,
  insertTrack,
  loadTracks,
  moveTrackToFolder,
  renameTrack,
  setTrackFavorite,
} from '@/src/services/trackStore';
import { Track } from '@/src/types';

jest.mock('@/src/services/trackStore', () => ({
  loadTracks: jest.fn(),
  insertTrack: jest.fn(),
  deleteTrack: jest.fn(),
  renameTrack: jest.fn(),
  moveTrackToFolder: jest.fn(),
  setTrackFavorite: jest.fn(),
  getTrackCountsByFolder: jest.fn(),
}));

jest.mock('@/src/services/folderStore', () => ({
  loadFolders: jest.fn().mockResolvedValue([]),
  markFolderOpened: jest.fn(),
  insertFolder: jest.fn(),
}));

jest.mock('@/src/services/settingsStore', () => ({
  getSetting: jest.fn().mockReturnValue(null),
  setSetting: jest.fn(),
}));

jest.mock('@/src/services/fileImport', () => ({
  pickAndImportFile: jest.fn(),
}));

jest.mock('@/src/hooks/useShareIntent', () => ({
  useShareIntent: jest.fn(),
}));

jest.mock('@/src/hooks/useTheme');

const mockPush = jest.fn();
let mockParams: Record<string, string | string[]> = {};
jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      ReactLocal.useEffect(cb, [cb]);
    },
    useRouter: () => ({ push: mockPush }),
    useLocalSearchParams: () => mockParams,
    Stack: { Screen: () => null },
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
      onToggleFavorite,
      onDelete,
      onOpenActions,
    }: {
      track: { id: string };
      onPress: (track: unknown) => void;
      onToggleFavorite: (track: unknown) => void;
      onDelete: (id: string) => void;
      onOpenActions: (track: unknown) => void;
    }) =>
      ReactLocal.createElement(View, {
        testID: 'track-item',
        onPress: () => onPress(track),
        onDelete: () => onDelete(track.id),
        onToggleFavorite: () => onToggleFavorite(track),
        onOpenActions: () => onOpenActions(track),
      }),
  };
});

jest.mock('@/src/components/SearchBar', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    SearchBar: ({
      value,
      onChangeText,
    }: {
      value: string;
      onChangeText: (text: string) => void;
    }) =>
      ReactLocal.createElement(View, {
        testID: 'search-bar',
        value,
        onChangeText,
      }),
  };
});

// Stubbed down to the props the screen drives, so a test can change the sort
// or the favourites filter without going through chip rendering — that is
// TrackSortBar's own suite's job.
jest.mock('@/src/components/TrackSortBar', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    TrackSortBar: (props: Record<string, unknown>) =>
      ReactLocal.createElement(View, { testID: 'sort-bar', ...props }),
  };
});

jest.mock('@/src/components/TrackRenameDialog', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    TrackRenameDialog: ({ onSave }: { onSave: (filename: string) => void }) =>
      ReactLocal.createElement(View, { testID: 'rename-dialog', onSave }),
  };
});

jest.mock('@/src/components/TrackActionsSheet', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    TrackActionsSheet: ({
      onMoveToFolder,
      onRename,
      onToggleFavorite,
    }: {
      onMoveToFolder: () => void;
      onRename: () => void;
      onToggleFavorite: () => void;
    }) =>
      ReactLocal.createElement(View, {
        testID: 'track-actions-sheet',
        onMoveToFolder,
        onRename,
        onToggleFavorite,
      }),
  };
});

jest.mock('@/src/components/FolderPickerDialog', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    FolderPickerDialog: ({
      onSelect,
      onCreateFolder,
    }: {
      onSelect: (folderId: string | null) => void;
      onCreateFolder?: () => void;
    }) =>
      ReactLocal.createElement(View, {
        testID: 'folder-picker',
        onSelect,
        onCreateFolder,
      }),
  };
});

jest.mock('@/src/components/CreateFolderDialog', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    CreateFolderDialog: ({
      onSave,
      onCancel,
    }: {
      onSave: (name: string) => void;
      onCancel: () => void;
    }) =>
      ReactLocal.createElement(View, {
        testID: 'create-folder-dialog',
        onSave,
        onCancel,
      }),
  };
});

const mockLoadTracks = loadTracks as jest.MockedFunction<typeof loadTracks>;
const mockInsertTrack = insertTrack as jest.MockedFunction<typeof insertTrack>;
const mockDeleteTrack = deleteTrack as jest.MockedFunction<typeof deleteTrack>;
const mockRenameTrack = renameTrack as jest.MockedFunction<typeof renameTrack>;
const mockMoveTrack = moveTrackToFolder as jest.MockedFunction<
  typeof moveTrackToFolder
>;
const mockInsertFolder = insertFolder as jest.MockedFunction<
  typeof insertFolder
>;
const mockSetTrackFavorite = setTrackFavorite as jest.MockedFunction<
  typeof setTrackFavorite
>;
const mockMarkFolderOpened = markFolderOpened as jest.MockedFunction<
  typeof markFolderOpened
>;
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
  isFavorite: false,
  lastPlayedAt: null,
};

async function renderScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<TracksScreen />);
  });
  return renderer;
}

function listedTracks(renderer: ReactTestRenderer): Track[] {
  return renderer.root.findByType(FlatList).props.data as Track[];
}

function trackIds(renderer: ReactTestRenderer): string[] {
  return listedTracks(renderer).map((t) => t.id);
}

function trackItems(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByProps({ testID: 'track-item' })
    .filter((node) => typeof node.type !== 'string');
}

function sheet(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByProps({ testID: 'track-actions-sheet' })
    .filter((node) => typeof node.type !== 'string')[0];
}

/**
 * Renames through the path the app actually offers: long press to open the
 * sheet, Rename to open the dialog, then save. Rename left the swipe
 * entirely, and the screen now owns the only rename dialog.
 */
async function renameViaSheet(
  renderer: ReactTestRenderer,
  filename: string,
): Promise<void> {
  await act(async () => {
    trackItems(renderer)[0].props.onOpenActions();
  });
  await act(async () => {
    sheet(renderer).props.onRename();
  });
  await act(async () => {
    await renderer.root
      .findAllByProps({ testID: 'rename-dialog' })
      .filter((node) => typeof node.type !== 'string')[0]
      .props.onSave(filename);
  });
}

function toastLabels(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByProps({ accessibilityRole: 'alert' })
    .map((node) => node.props.accessibilityLabel);
}

function textNodeExists(renderer: ReactTestRenderer, text: string): boolean {
  return renderer.root.findAllByProps({ children: text }).length > 0;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
  mockParams = { scope: 'all', name: 'All tracks' };
  mockLoadTracks.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('track view scope', () => {
  it('reads every track for the All tracks entry', async () => {
    const renderer = await renderScreen();
    expect(mockLoadTracks).toHaveBeenCalledWith({ scope: 'all' });
    act(() => renderer.unmount());
  });

  it('reads starred tracks for the Favourites entry', async () => {
    mockParams = { scope: 'favorites', name: 'Favourites' };
    const renderer = await renderScreen();
    expect(mockLoadTracks).toHaveBeenCalledWith({ scope: 'favorites' });
    act(() => renderer.unmount());
  });

  it('reads unfiled tracks for the Unfiled entry', async () => {
    mockParams = { scope: 'unfiled', name: 'Unfiled' };
    const renderer = await renderScreen();
    expect(mockLoadTracks).toHaveBeenCalledWith({ scope: 'unfiled' });
    act(() => renderer.unmount());
  });

  it('reads one folder for a real folder', async () => {
    mockParams = { scope: 'folder', folderId: 'f-1', name: 'Scales' };
    const renderer = await renderScreen();
    expect(mockLoadTracks).toHaveBeenCalledWith({
      scope: 'folder',
      folderId: 'f-1',
    });
    act(() => renderer.unmount());
  });

  // A malformed link should land somewhere usable rather than on a blank
  // screen, and every track is the one view that is always safe to show.
  it('falls back to every track for an unrecognised scope', async () => {
    mockParams = { scope: 'nonsense', name: 'Nonsense' };
    const renderer = await renderScreen();
    expect(mockLoadTracks).toHaveBeenCalledWith({ scope: 'all' });
    act(() => renderer.unmount());
  });

  it('falls back to every track when a folder scope carries no folder', async () => {
    mockParams = { scope: 'folder', name: 'Scales' };
    const renderer = await renderScreen();
    expect(mockLoadTracks).toHaveBeenCalledWith({ scope: 'all' });
    act(() => renderer.unmount());
  });
});

describe('track view folder opening', () => {
  it('stamps a real folder as opened, once', async () => {
    mockParams = { scope: 'folder', folderId: 'f-1', name: 'Scales' };
    const renderer = await renderScreen();

    expect(mockMarkFolderOpened).toHaveBeenCalledTimes(1);
    expect(mockMarkFolderOpened).toHaveBeenCalledWith(
      'f-1',
      expect.any(Number),
    );
    act(() => renderer.unmount());
  });

  it('does not stamp anything for a built-in entry', async () => {
    mockParams = { scope: 'favorites', name: 'Favourites' };
    const renderer = await renderScreen();

    expect(mockMarkFolderOpened).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  // The stamp is an ordering hint for the library root, so a failed write is
  // not something the reader needs to hear about.
  it('opens the folder even when the stamp fails', async () => {
    mockParams = { scope: 'folder', folderId: 'f-1', name: 'Scales' };
    mockMarkFolderOpened.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });
    mockLoadTracks.mockResolvedValue([sampleTrack]);

    const renderer = await renderScreen();

    expect(trackIds(renderer)).toEqual(['track-1']);
    expect(toastLabels(renderer)).toEqual([]);
    act(() => renderer.unmount());
  });
});

describe('track view import destination', () => {
  it('imports into the folder being viewed and names it', async () => {
    mockParams = { scope: 'folder', folderId: 'f-1', name: 'Scales' };
    mockPickAndImportFile.mockResolvedValueOnce({
      success: true,
      track: sampleTrack,
    });

    const renderer = await renderScreen();
    const importButton = renderer.root.findAllByProps({
      testID: 'import-button',
    })[0];
    await act(async () => {
      await importButton.props.onPress();
    });

    expect(mockInsertTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1', folderId: 'f-1' }),
    );
    expect(toastLabels(renderer)).toContain('Imported song.mp3 to Scales');
    expect(trackIds(renderer)).toEqual(['track-1']);
    act(() => renderer.unmount());
  });

  it('imports into Unfiled from a built-in entry', async () => {
    mockParams = { scope: 'all', name: 'All tracks' };
    mockPickAndImportFile.mockResolvedValueOnce({
      success: true,
      track: { ...sampleTrack, folderId: 'stale-folder' },
    });

    const renderer = await renderScreen();
    const importButton = renderer.root.findAllByProps({
      testID: 'import-button',
    })[0];
    await act(async () => {
      await importButton.props.onPress();
    });

    expect(mockInsertTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1', folderId: null }),
    );
    expect(toastLabels(renderer)).toContain('Imported song.mp3 to Unfiled');
    act(() => renderer.unmount());
  });

  // A track is never starred at the moment it is imported, so showing it in
  // Favourites would be a listing the next read would silently take away.
  it('keeps a new import out of the Favourites list', async () => {
    mockParams = { scope: 'favorites', name: 'Favourites' };
    mockPickAndImportFile.mockResolvedValueOnce({
      success: true,
      track: sampleTrack,
    });

    const renderer = await renderScreen();
    const importButton = renderer.root.findAllByProps({
      testID: 'import-button',
    })[0];
    await act(async () => {
      await importButton.props.onPress();
    });

    expect(mockInsertTrack).toHaveBeenCalled();
    expect(toastLabels(renderer)).toContain('Imported song.mp3 to Unfiled');
    expect(trackIds(renderer)).toEqual([]);
    act(() => renderer.unmount());
  });
});

describe('track view track actions', () => {
  it('renames a track, patching only its filename', async () => {
    const measured: Track = {
      ...sampleTrack,
      durationMs: 187_000,
      fileSizeBytes: 5_242_880,
      importedAt: 1_700_000_000_000,
    };
    mockLoadTracks.mockResolvedValue([measured]);

    const renderer = await renderScreen();
    await renameViaSheet(renderer, 'Practice take.mp3');

    expect(mockRenameTrack).toHaveBeenCalledWith(
      'track-1',
      'Practice take.mp3',
    );
    expect(listedTracks(renderer)).toEqual([
      { ...measured, filename: 'Practice take.mp3' },
    ]);
    expect(toastLabels(renderer)).toContain('Renamed to Practice take.mp3');
    act(() => renderer.unmount());
  });

  it('reports a failed rename', async () => {
    mockLoadTracks.mockResolvedValue([sampleTrack]);
    mockRenameTrack.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    const renderer = await renderScreen();
    await renameViaSheet(renderer, 'Practice take.mp3');

    expect(toastLabels(renderer)).toContain('Failed to rename track');
    act(() => renderer.unmount());
  });

  it('stars a track optimistically and reports it', async () => {
    mockLoadTracks.mockResolvedValue([sampleTrack]);

    const renderer = await renderScreen();
    await act(async () => {
      await trackItems(renderer)[0].props.onToggleFavorite();
    });

    expect(mockSetTrackFavorite).toHaveBeenCalledWith('track-1', true);
    expect(listedTracks(renderer)[0].isFavorite).toBe(true);
    expect(toastLabels(renderer)).toContain('Added to favourites');
    act(() => renderer.unmount());
  });

  it('puts the row back when the favourite write fails', async () => {
    mockLoadTracks.mockResolvedValue([sampleTrack]);
    mockSetTrackFavorite.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    const renderer = await renderScreen();
    await act(async () => {
      await trackItems(renderer)[0].props.onToggleFavorite();
    });

    // Leaving the star showing would claim a state the database does not
    // hold, which is worse than the toggle appearing not to have worked.
    expect(listedTracks(renderer)[0].isFavorite).toBe(false);
    expect(toastLabels(renderer)).toContain('Failed to update favourite');
    act(() => renderer.unmount());
  });

  it('toggles the favourite from the long-press sheet too', async () => {
    mockLoadTracks.mockResolvedValue([sampleTrack]);

    const renderer = await renderScreen();
    await act(async () => {
      trackItems(renderer)[0].props.onOpenActions();
    });
    await act(async () => {
      await sheet(renderer).props.onToggleFavorite();
    });

    expect(mockSetTrackFavorite).toHaveBeenCalledWith('track-1', true);
    act(() => renderer.unmount());
  });

  // The Favourites-scope branch is the one that removes the row rather than
  // patching it, and it is where a rollback can go wrong.
  describe('unstarring inside the Favourites view', () => {
    async function renderFavourites() {
      mockParams = { scope: 'favorites', name: 'Favourites' };
      mockLoadTracks.mockResolvedValue([{ ...sampleTrack, isFavorite: true }]);
      return renderScreen();
    }

    it('takes the row out of the view it no longer belongs in', async () => {
      const renderer = await renderFavourites();
      await act(async () => {
        await trackItems(renderer)[0].props.onToggleFavorite();
      });

      expect(mockSetTrackFavorite).toHaveBeenCalledWith('track-1', false);
      expect(trackIds(renderer)).toEqual([]);
      expect(toastLabels(renderer)).toContain('Removed from favourites');
      act(() => renderer.unmount());
    });

    it('restores exactly one row when the write fails', async () => {
      mockSetTrackFavorite.mockImplementationOnce(() => {
        throw new Error('db write failed');
      });
      const renderer = await renderFavourites();
      await act(async () => {
        await trackItems(renderer)[0].props.onToggleFavorite();
      });

      // Restoring by appending blind would put two rows with the same key in
      // the list if a reload had already re-added it.
      expect(trackIds(renderer)).toEqual(['track-1']);
      expect(listedTracks(renderer)[0].isFavorite).toBe(true);
      expect(toastLabels(renderer)).toContain('Failed to update favourite');
      act(() => renderer.unmount());
    });

    it('does not let a read that began during the write undo it', async () => {
      // The window that matters is *inside* the write, not before it: on web
      // the write is asynchronous, and a read started while it is in flight
      // still sees the track as starred. Landing that read would put the row
      // back moments after the toast said it had gone. Hold the write open
      // so the reload can start in the middle of it.
      let commitWrite!: () => void;
      mockSetTrackFavorite.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            commitWrite = resolve;
          }) as unknown as void,
      );

      const renderer = await renderFavourites();

      let togglingDone!: Promise<void>;
      await act(async () => {
        togglingDone = trackItems(renderer)[0].props.onToggleFavorite();
      });

      // Mid-write: the store still reports the old value.
      const onRefresh =
        renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;
      let refreshDone!: Promise<void>;
      await act(async () => {
        refreshDone = onRefresh();
      });

      await act(async () => {
        commitWrite();
        await togglingDone;
        await refreshDone;
      });

      expect(trackIds(renderer)).toEqual([]);
      act(() => renderer.unmount());
    });
  });

  it('deletes a track and reports it', async () => {
    mockLoadTracks.mockResolvedValue([sampleTrack]);

    const renderer = await renderScreen();
    await act(async () => {
      await trackItems(renderer)[0].props.onDelete();
    });

    expect(mockDeleteTrack).toHaveBeenCalledWith('track-1');
    expect(trackIds(renderer)).toEqual([]);
    expect(toastLabels(renderer)).toContain('Track deleted');
    act(() => renderer.unmount());
  });

  it('reports a failed delete and keeps the track listed', async () => {
    mockLoadTracks.mockResolvedValue([sampleTrack]);
    mockDeleteTrack.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    const renderer = await renderScreen();
    await act(async () => {
      await trackItems(renderer)[0].props.onDelete();
    });

    expect(toastLabels(renderer)).toContain('Failed to delete track');
    expect(trackIds(renderer)).toEqual(['track-1']);
    act(() => renderer.unmount());
  });

  // The uri is deliberately left out of the route: on web it is a `blob:`
  // object URL that dies with the document, so a route carrying one broke on
  // reload. The player re-resolves it from the track id instead.
  it('opens the player by track id, without the volatile uri', async () => {
    mockLoadTracks.mockResolvedValue([sampleTrack]);

    const renderer = await renderScreen();
    await act(async () => {
      trackItems(renderer)[0].props.onPress();
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

describe('track view move between folders', () => {
  async function move(
    renderer: ReactTestRenderer,
    target: string | null,
  ): Promise<void> {
    await act(async () => {
      trackItems(renderer)[0].props.onOpenActions();
    });
    const sheet = renderer.root
      .findAllByProps({ testID: 'track-actions-sheet' })
      .filter((node) => typeof node.type !== 'string')[0];
    await act(async () => {
      await sheet.props.onMoveToFolder();
    });
    const picker = renderer.root
      .findAllByProps({ testID: 'folder-picker' })
      .filter((node) => typeof node.type !== 'string')[0];
    await act(async () => {
      await picker.props.onSelect(target);
    });
  }

  // A reader with no folders yet reached a picker offering only the root
  // they were already in. Filing a track had to start on another screen.
  describe('filing into a folder that does not exist yet', () => {
    async function createFolderWhileMoving(
      renderer: ReactTestRenderer,
      name: string,
    ): Promise<void> {
      await act(async () => {
        trackItems(renderer)[0].props.onOpenActions();
      });
      const sheet = renderer.root
        .findAllByProps({ testID: 'track-actions-sheet' })
        .filter((node) => typeof node.type !== 'string')[0];
      await act(async () => {
        await sheet.props.onMoveToFolder();
      });
      const picker = renderer.root
        .findAllByProps({ testID: 'folder-picker' })
        .filter((node) => typeof node.type !== 'string')[0];
      await act(async () => {
        picker.props.onCreateFolder();
      });
      const dialog = renderer.root
        .findAllByProps({ testID: 'create-folder-dialog' })
        .filter((node) => typeof node.type !== 'string')[0];
      await act(async () => {
        await dialog.props.onSave(name);
      });
    }

    it('creates the folder and files the track into it', async () => {
      mockLoadTracks.mockResolvedValue([sampleTrack]);

      const renderer = await renderScreen();
      await createFolderWhileMoving(renderer, 'Warmups');

      expect(mockInsertFolder).toHaveBeenCalledTimes(1);
      const created = mockInsertFolder.mock.calls[0][0];
      expect(created.name).toBe('Warmups');
      expect(mockMoveTrack).toHaveBeenCalledWith('track-1', created.id);
      expect(toastLabels(renderer)).toContain('Track moved');
      act(() => renderer.unmount());
    });

    // The picker closes when the name dialog opens, so the reader is never
    // typing into a field stacked on top of the list it came from.
    it('closes the picker while the name is being typed', async () => {
      mockLoadTracks.mockResolvedValue([sampleTrack]);

      const renderer = await renderScreen();
      await act(async () => {
        trackItems(renderer)[0].props.onOpenActions();
      });
      const sheet = renderer.root
        .findAllByProps({ testID: 'track-actions-sheet' })
        .filter((node) => typeof node.type !== 'string')[0];
      await act(async () => {
        await sheet.props.onMoveToFolder();
      });
      const picker = renderer.root
        .findAllByProps({ testID: 'folder-picker' })
        .filter((node) => typeof node.type !== 'string')[0];
      await act(async () => {
        picker.props.onCreateFolder();
      });

      expect(
        renderer.root.findAllByProps({ testID: 'folder-picker' }),
      ).toHaveLength(0);
      expect(
        renderer.root
          .findAllByProps({ testID: 'create-folder-dialog' })
          .filter((node) => typeof node.type !== 'string'),
      ).toHaveLength(1);
      act(() => renderer.unmount());
    });

    // Backing out of the name is a change of mind about the new folder, not
    // about filing the track — dropping the reader all the way out would
    // make them reopen the row menu to pick an existing folder.
    it('returns to the picker when the name is cancelled', async () => {
      mockLoadTracks.mockResolvedValue([sampleTrack]);

      const renderer = await renderScreen();
      await act(async () => {
        trackItems(renderer)[0].props.onOpenActions();
      });
      const sheet = renderer.root
        .findAllByProps({ testID: 'track-actions-sheet' })
        .filter((node) => typeof node.type !== 'string')[0];
      await act(async () => {
        await sheet.props.onMoveToFolder();
      });
      await act(async () => {
        renderer.root
          .findAllByProps({ testID: 'folder-picker' })
          .filter((node) => typeof node.type !== 'string')[0]
          .props.onCreateFolder();
      });
      await act(async () => {
        renderer.root
          .findAllByProps({ testID: 'create-folder-dialog' })
          .filter((node) => typeof node.type !== 'string')[0]
          .props.onCancel();
      });

      expect(
        renderer.root
          .findAllByProps({ testID: 'folder-picker' })
          .filter((node) => typeof node.type !== 'string'),
      ).toHaveLength(1);
      expect(
        renderer.root.findAllByProps({ testID: 'create-folder-dialog' }),
      ).toHaveLength(0);
      act(() => renderer.unmount());
    });

    it('reports a failed create and leaves the track where it was', async () => {
      mockLoadTracks.mockResolvedValue([sampleTrack]);
      mockInsertFolder.mockRejectedValueOnce(new Error('disk full'));

      const renderer = await renderScreen();
      await createFolderWhileMoving(renderer, 'Warmups');

      expect(mockMoveTrack).not.toHaveBeenCalled();
      expect(toastLabels(renderer)).toContain('Failed to create folder');
      act(() => renderer.unmount());
    });
  });

  it('takes a moved track out of the folder it left', async () => {
    mockParams = { scope: 'folder', folderId: 'f-1', name: 'Scales' };
    mockLoadTracks.mockResolvedValue([{ ...sampleTrack, folderId: 'f-1' }]);

    const renderer = await renderScreen();
    await move(renderer, 'f-2');

    expect(mockMoveTrack).toHaveBeenCalledWith('track-1', 'f-2');
    expect(trackIds(renderer)).toEqual([]);
    expect(toastLabels(renderer)).toContain('Track moved');
    act(() => renderer.unmount());
  });

  // All tracks holds every track whatever folder it is in, so a move must not
  // make the row vanish from under the reader.
  it('keeps a moved track listed in All tracks', async () => {
    mockParams = { scope: 'all', name: 'All tracks' };
    mockLoadTracks.mockResolvedValue([sampleTrack]);

    const renderer = await renderScreen();
    await move(renderer, 'f-2');

    expect(mockMoveTrack).toHaveBeenCalledWith('track-1', 'f-2');
    expect(trackIds(renderer)).toEqual(['track-1']);
    expect(listedTracks(renderer)[0].folderId).toBe('f-2');
    act(() => renderer.unmount());
  });

  // Unfiled is defined by having no folder, so filing a track into one takes
  // it out of that view.
  it('takes a track filed into a folder out of Unfiled', async () => {
    mockParams = { scope: 'unfiled', name: 'Unfiled' };
    mockLoadTracks.mockResolvedValue([sampleTrack]);

    const renderer = await renderScreen();
    await move(renderer, 'f-2');

    expect(trackIds(renderer)).toEqual([]);
    act(() => renderer.unmount());
  });

  it('reports a failed move', async () => {
    mockParams = { scope: 'all', name: 'All tracks' };
    mockLoadTracks.mockResolvedValue([sampleTrack]);
    mockMoveTrack.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    const renderer = await renderScreen();
    await move(renderer, 'f-2');

    expect(toastLabels(renderer)).toContain('Failed to move track');
    expect(trackIds(renderer)).toEqual(['track-1']);
    act(() => renderer.unmount());
  });
});

describe('track view empty states', () => {
  it('says a folder is empty', async () => {
    mockParams = { scope: 'folder', folderId: 'f-1', name: 'Scales' };
    const renderer = await renderScreen();
    expect(textNodeExists(renderer, 'This folder is empty.')).toBe(true);
    act(() => renderer.unmount());
  });

  it('says nothing is starred yet', async () => {
    mockParams = { scope: 'favorites', name: 'Favourites' };
    const renderer = await renderScreen();
    expect(textNodeExists(renderer, 'Nothing starred yet.')).toBe(true);
    act(() => renderer.unmount());
  });

  it('says every track is filed when Unfiled is empty', async () => {
    mockParams = { scope: 'unfiled', name: 'Unfiled' };
    const renderer = await renderScreen();
    expect(textNodeExists(renderer, 'Every track is filed in a folder.')).toBe(
      true,
    );
    act(() => renderer.unmount());
  });

  it('reports a search with no matches instead of an empty entry', async () => {
    mockLoadTracks.mockResolvedValue([sampleTrack]);
    const renderer = await renderScreen();

    const bar = renderer.root.findByProps({ testID: 'search-bar' });
    await act(async () => {
      bar.props.onChangeText('nothing here');
    });

    expect(textNodeExists(renderer, 'No tracks match.')).toBe(true);
    expect(trackIds(renderer)).toEqual([]);
    act(() => renderer.unmount());
  });

  it('filters the list by filename', async () => {
    mockLoadTracks.mockResolvedValue([
      sampleTrack,
      { ...sampleTrack, id: 'track-2', filename: 'riff.wav' },
    ]);
    const renderer = await renderScreen();

    const bar = renderer.root.findByProps({ testID: 'search-bar' });
    await act(async () => {
      bar.props.onChangeText('riff');
    });

    expect(trackIds(renderer)).toEqual(['track-2']);
    act(() => renderer.unmount());
  });
});

describe('track view load and refresh reporting', () => {
  it('reports a failed initial load', async () => {
    mockLoadTracks.mockRejectedValueOnce(new Error('db read failed'));

    const renderer = await renderScreen();

    expect(toastLabels(renderer)).toContain('Failed to load tracks');
    act(() => renderer.unmount());
  });

  it('does not report a load that lands after the screen has gone', async () => {
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

    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalledWith(
      'Failed to load tracks',
    );
  });

  it('announces a successful pull-to-refresh', async () => {
    const renderer = await renderScreen();
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;
    await act(async () => {
      await onRefresh();
    });

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Tracks refreshed',
    );
    act(() => renderer.unmount());
  });

  it('announces a failed pull-to-refresh', async () => {
    const renderer = await renderScreen();
    mockLoadTracks.mockRejectedValueOnce(new Error('db read failed'));
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;
    await act(async () => {
      await onRefresh();
    });

    expect(toastLabels(renderer)).toContain('Failed to refresh tracks');
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalledWith(
      'Tracks refreshed',
    );
    act(() => renderer.unmount());
  });

  // A read that started before the delete holds a snapshot that predates it,
  // so letting it land would bring the track back.
  it('does not resurrect a deleted track when an older read resolves', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    let resolveLoad!: (tracks: Track[]) => void;
    mockLoadTracks.mockReturnValueOnce(
      new Promise<Track[]>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;
    let refreshDone!: Promise<void>;
    await act(async () => {
      refreshDone = onRefresh();
    });

    await act(async () => {
      await trackItems(renderer)[0].props.onDelete();
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

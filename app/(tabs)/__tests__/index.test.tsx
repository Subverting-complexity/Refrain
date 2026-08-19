import React from 'react';
import { AccessibilityInfo, FlatList } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import LibraryScreen from '../index';
import { pickAndImportFile } from '@/src/services/fileImport';
import {
  deleteFolder,
  insertFolder,
  loadFolders,
  renameFolder,
  reorderPinnedFolders,
} from '@/src/services/folderStore';
import { getTrackCountsByFolder, insertTrack } from '@/src/services/trackStore';
import { Folder, Track, TrackCounts } from '@/src/types';

jest.mock('@/src/services/trackStore', () => ({
  loadTracks: jest.fn(),
  insertTrack: jest.fn(),
  deleteTrack: jest.fn(),
  renameTrack: jest.fn(),
  moveTrackToFolder: jest.fn(),
  setTrackFavorite: jest.fn(),
  markTrackPlayed: jest.fn(),
  getTrackCountsByFolder: jest.fn(),
}));

jest.mock('@/src/services/folderStore', () => ({
  loadFolders: jest.fn(),
  insertFolder: jest.fn(),
  deleteFolder: jest.fn(),
  renameFolder: jest.fn(),
  markFolderOpened: jest.fn(),
  setFolderPinned: jest.fn(),
  reorderPinnedFolders: jest.fn(),
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

jest.mock('@/src/components/DraggablePinnedFolderList', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  const { FolderListItem } = require('@/src/components/FolderListItem');
  return {
    DraggablePinnedFolderList: ({
      folders,
      trackCounts,
      onOpenFolder,
      onOpenActions,
      onDeleteFolder,
      onRenameFolder,
      onReorder,
    }: {
      folders: Array<{ id: string; name: string }>;
      trackCounts: Record<string, number>;
      onOpenFolder: (folder: any) => void;
      onOpenActions: (folder: any) => void;
      onDeleteFolder: (folder: any) => void;
      onRenameFolder: (folder: any) => void;
      onReorder: (orderedIds: string[]) => void;
    }) =>
      ReactLocal.createElement(
        View,
        { testID: 'draggable-pinned-folder-list', onReorder },
        folders.map((f) =>
          ReactLocal.createElement(FolderListItem, {
            key: f.id,
            name: f.name,
            trackCount: trackCounts[f.id] ?? 0,
            pinned: true,
            onPress: () => onOpenFolder(f),
            onOpenActions: () => onOpenActions(f),
            onDelete: () => onDeleteFolder(f),
            onRename: () => onRenameFolder(f),
          }),
        ),
      ),
  };
});

jest.mock('@/src/components/FolderListItem', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    FolderListItem: ({
      name,
      trackCount,
      kind,
      icon,
      onPress,
      onDelete,
      onRename,
      onOpenActions,
      pinned,
    }: {
      name: string;
      trackCount: number;
      kind?: string;
      icon?: string;
      onPress?: () => void;
      onDelete?: () => void;
      onRename?: () => void;
      onOpenActions?: () => void;
      pinned?: boolean;
    }) =>
      ReactLocal.createElement(View, {
        testID: 'root-entry',
        entryName: name,
        trackCount,
        kind: kind ?? 'folder',
        icon,
        onPress,
        onDelete,
        onRename,
        onOpenActions,
        pinned: pinned ?? false,
      }),
  };
});

jest.mock('@/src/components/FolderActionsSheet', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    FolderActionsSheet: (props: Record<string, unknown>) =>
      ReactLocal.createElement(View, {
        testID: 'folder-actions-sheet',
        ...props,
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

jest.mock('@/src/components/CreateFolderDialog', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    CreateFolderDialog: ({ onSave }: { onSave: (name: string) => void }) =>
      ReactLocal.createElement(View, {
        testID: 'create-folder-dialog',
        onSave,
      }),
  };
});

jest.mock('@/src/components/NameEntryDialog', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    NameEntryDialog: ({ onConfirm }: { onConfirm: (name: string) => void }) =>
      ReactLocal.createElement(View, {
        testID: 'name-entry-dialog',
        onConfirm,
      }),
  };
});

const mockLoadFolders = loadFolders as jest.MockedFunction<typeof loadFolders>;
const mockInsertFolder = insertFolder as jest.MockedFunction<
  typeof insertFolder
>;
const mockDeleteFolder = deleteFolder as jest.MockedFunction<
  typeof deleteFolder
>;
const mockRenameFolder = renameFolder as jest.MockedFunction<
  typeof renameFolder
>;
const mockCounts = getTrackCountsByFolder as jest.MockedFunction<
  typeof getTrackCountsByFolder
>;
const mockReorderPinned = reorderPinnedFolders as jest.MockedFunction<
  typeof reorderPinnedFolders
>;
const mockInsertTrack = insertTrack as jest.MockedFunction<typeof insertTrack>;
const mockPickAndImportFile = pickAndImportFile as jest.MockedFunction<
  typeof pickAndImportFile
>;

function counts(overrides: Partial<TrackCounts> = {}): TrackCounts {
  return { byFolder: {}, all: 0, favorites: 0, unfiled: 0, ...overrides };
}

function folder(
  id: string,
  name: string,
  pinOrder: number | null = null,
): Folder {
  return { id, name, createdAt: 0, pinOrder, lastOpenedAt: null };
}

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
    renderer = create(<LibraryScreen />);
  });
  return renderer;
}

interface EntryProps {
  entryName: string;
  trackCount: number;
  kind: string;
  icon?: string;
  onPress?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  onOpenActions?: () => void;
  pinned?: boolean;
}

// findAllByProps matches both the mock element and the host view it renders
// to, so each row would otherwise be counted twice. Keep the composite one,
// which carries the props the screen actually passed.
function entries(renderer: ReactTestRenderer): EntryProps[] {
  return renderer.root
    .findAllByProps({ testID: 'root-entry' })
    .filter((node) => typeof node.type !== 'string')
    .map((node) => node.props as EntryProps);
}

function entryNames(renderer: ReactTestRenderer): string[] {
  return entries(renderer).map((e) => e.entryName);
}

function toastLabels(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByProps({ accessibilityRole: 'alert' })
    .map((node) => node.props.accessibilityLabel);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
  mockLoadFolders.mockResolvedValue([]);
  mockCounts.mockReturnValue(counts());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('library root shows folders only', () => {
  it('lists the built-in entries above the reader’s own folders', async () => {
    mockCounts.mockReturnValue(
      counts({ all: 5, favorites: 2, unfiled: 1, byFolder: { 'f-1': 4 } }),
    );
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();

    expect(entryNames(renderer)).toEqual([
      'All tracks',
      'Favourites',
      'Unfiled',
      'Scales',
    ]);
    act(() => renderer.unmount());
  });

  it('hides Unfiled entirely when nothing is unfiled', async () => {
    mockCounts.mockReturnValue(
      counts({ all: 4, favorites: 1, unfiled: 0, byFolder: { 'f-1': 4 } }),
    );
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();

    expect(entryNames(renderer)).not.toContain('Unfiled');
    act(() => renderer.unmount());
  });

  it('shows each entry’s track count', async () => {
    mockCounts.mockReturnValue(
      counts({ all: 7, favorites: 3, unfiled: 2, byFolder: { 'f-1': 5 } }),
    );
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();

    expect(entries(renderer).map((e) => [e.entryName, e.trackCount])).toEqual([
      ['All tracks', 7],
      ['Favourites', 3],
      ['Unfiled', 2],
      ['Scales', 5],
    ]);
    act(() => renderer.unmount());
  });

  // The built-in entries are queries, not records: nothing about them can be
  // renamed or deleted, so they must not offer the actions a folder does.
  it('offers no rename or delete on the built-in entries', async () => {
    mockCounts.mockReturnValue(counts({ all: 2, unfiled: 2 }));
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();

    const builtins = entries(renderer).filter((e) => e.kind === 'builtin');
    expect(builtins).toHaveLength(3);
    for (const builtin of builtins) {
      expect(builtin.onRename).toBeUndefined();
      expect(builtin.onDelete).toBeUndefined();
    }
    const folders = entries(renderer).filter((e) => e.kind === 'folder');
    expect(folders[0].onRename).toBeDefined();
    expect(folders[0].onDelete).toBeDefined();
    act(() => renderer.unmount());
  });

  // Sharing the folder glyph would make a saved query read as something the
  // reader could rearrange.
  it('gives the built-in entries their own icons', async () => {
    mockCounts.mockReturnValue(counts({ all: 2, unfiled: 2 }));

    const renderer = await renderScreen();

    expect(entries(renderer).map((e) => e.icon)).toEqual([
      'albums',
      'star',
      'file-tray',
    ]);
    act(() => renderer.unmount());
  });
});

describe('library root search', () => {
  async function search(
    renderer: ReactTestRenderer,
    query: string,
  ): Promise<void> {
    const bar = renderer.root.findByProps({ testID: 'search-bar' });
    await act(async () => {
      bar.props.onChangeText(query);
    });
  }

  it('filters folders by name while keeping the built-in entries', async () => {
    mockCounts.mockReturnValue(counts({ all: 3, unfiled: 1 }));
    mockLoadFolders.mockResolvedValue([
      folder('f-1', 'Scales'),
      folder('f-2', 'Riffs'),
    ]);

    const renderer = await renderScreen();
    await search(renderer, 'sca');

    expect(entryNames(renderer)).toEqual([
      'All tracks',
      'Favourites',
      'Unfiled',
      'Scales',
    ]);
    act(() => renderer.unmount());
  });

  it('reports when no folder matches, without hiding the built-in entries', async () => {
    mockCounts.mockReturnValue(counts({ all: 3, unfiled: 1 }));
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();
    await search(renderer, 'nothing here');

    expect(entryNames(renderer)).toEqual([
      'All tracks',
      'Favourites',
      'Unfiled',
    ]);
    expect(
      renderer.root.findAllByProps({ children: 'No folders match.' }).length,
    ).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });
});

describe('library root navigation', () => {
  it('opens a built-in entry as a track view', async () => {
    mockCounts.mockReturnValue(counts({ all: 3, favorites: 1, unfiled: 1 }));

    const renderer = await renderScreen();
    const favourites = entries(renderer).find(
      (e) => e.entryName === 'Favourites',
    )!;
    await act(async () => {
      favourites.onPress?.();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/tracks',
      params: { scope: 'favorites', name: 'Favourites' },
    });
    act(() => renderer.unmount());
  });

  it('opens a real folder as a track view carrying its id and name', async () => {
    mockCounts.mockReturnValue(counts({ all: 3, byFolder: { 'f-1': 3 } }));
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();
    const scales = entries(renderer).find((e) => e.entryName === 'Scales')!;
    await act(async () => {
      scales.onPress?.();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/tracks',
      params: { scope: 'folder', folderId: 'f-1', name: 'Scales' },
    });
    act(() => renderer.unmount());
  });
});

describe('library root folder management', () => {
  it('creates a folder and reports it', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));

    const renderer = await renderScreen();
    const createButton = renderer.root.findByProps({
      accessibilityLabel: 'Create folder',
    });
    await act(async () => {
      createButton.props.onPress();
    });
    const dialog = renderer.root.findByProps({
      testID: 'create-folder-dialog',
    });
    await act(async () => {
      await dialog.props.onSave('Scales');
    });

    expect(mockInsertFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'test-uuid', name: 'Scales' }),
    );
    expect(toastLabels(renderer)).toContain('Created folder "Scales"');
    expect(entryNames(renderer)).toContain('Scales');
    act(() => renderer.unmount());
  });

  it('reports a folder creation failure', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));
    mockInsertFolder.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    const renderer = await renderScreen();
    const createButton = renderer.root.findByProps({
      accessibilityLabel: 'Create folder',
    });
    await act(async () => {
      createButton.props.onPress();
    });
    const dialog = renderer.root.findByProps({
      testID: 'create-folder-dialog',
    });
    await act(async () => {
      await dialog.props.onSave('Scales');
    });

    expect(toastLabels(renderer)).toContain('Failed to create folder');
    act(() => renderer.unmount());
  });

  it('renames a folder in place', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, byFolder: { 'f-1': 1 } }));
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();
    const scales = entries(renderer).find((e) => e.entryName === 'Scales')!;
    await act(async () => {
      scales.onRename?.();
    });
    const dialog = renderer.root.findByProps({ testID: 'name-entry-dialog' });
    await act(async () => {
      await dialog.props.onConfirm('Warm-ups');
    });

    expect(mockRenameFolder).toHaveBeenCalledWith('f-1', 'Warm-ups');
    expect(entryNames(renderer)).toContain('Warm-ups');
    act(() => renderer.unmount());
  });

  // Deleting a folder unfiles its tracks, so the counts on the built-in rows
  // move too — the screen has to read them back rather than guess.
  // The row raises the request; the screen asks the question, because only
  // the screen knows how many tracks are about to move and where to.
  async function confirmDelete(
    renderer: ReactTestRenderer,
    name: string,
  ): Promise<void> {
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: `Confirm delete ${name}` })
        .props.onPress();
    });
  }

  it('names the destination and the count before deleting a folder', async () => {
    mockCounts.mockReturnValue(counts({ all: 2, byFolder: { 'f-1': 24 } }));
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();
    const scales = entries(renderer).find((e) => e.entryName === 'Scales')!;
    await act(async () => {
      await scales.onDelete?.();
    });

    // Nothing has been deleted yet, and the question says what will happen
    // to what is inside.
    expect(mockDeleteFolder).not.toHaveBeenCalled();
    const dialogText = renderer.root
      .findAll((n) => typeof n.props.children === 'string')
      .map((n) => n.props.children as string);
    expect(dialogText).toContain('Delete Scales?');
    expect(dialogText).toContain('Its 24 tracks move to Unfiled.');
    act(() => renderer.unmount());
  });

  it('says an empty folder is empty rather than moving no tracks', async () => {
    mockCounts.mockReturnValue(counts({ all: 0, byFolder: { 'f-1': 0 } }));
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();
    const scales = entries(renderer).find((e) => e.entryName === 'Scales')!;
    await act(async () => {
      await scales.onDelete?.();
    });

    expect(
      renderer.root
        .findAll((n) => typeof n.props.children === 'string')
        .map((n) => n.props.children as string),
    ).toContain('This folder is empty.');
    act(() => renderer.unmount());
  });

  it('re-reads the library after deleting a folder', async () => {
    mockCounts.mockReturnValue(counts({ all: 2, byFolder: { 'f-1': 2 } }));
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);

    const renderer = await renderScreen();
    mockCounts.mockReturnValue(counts({ all: 2, unfiled: 2 }));
    mockLoadFolders.mockResolvedValue([]);

    const scales = entries(renderer).find((e) => e.entryName === 'Scales')!;
    await act(async () => {
      await scales.onDelete?.();
    });
    await confirmDelete(renderer, 'Scales');

    expect(mockDeleteFolder).toHaveBeenCalledWith('f-1');
    expect(toastLabels(renderer)).toContain('Folder deleted');
    expect(entryNames(renderer)).toEqual([
      'All tracks',
      'Favourites',
      'Unfiled',
    ]);
    act(() => renderer.unmount());
  });

  it('reports a folder delete failure and leaves the folder listed', async () => {
    mockCounts.mockReturnValue(counts({ all: 2, byFolder: { 'f-1': 2 } }));
    mockLoadFolders.mockResolvedValue([folder('f-1', 'Scales')]);
    mockDeleteFolder.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    const renderer = await renderScreen();
    const scales = entries(renderer).find((e) => e.entryName === 'Scales')!;
    await act(async () => {
      await scales.onDelete?.();
    });
    await confirmDelete(renderer, 'Scales');

    expect(toastLabels(renderer)).toContain('Failed to delete folder');
    expect(entryNames(renderer)).toContain('Scales');
    act(() => renderer.unmount());
  });
});

describe('library root new folder placement', () => {
  // #240: a new folder belongs at the top of the unpinned block. Appending
  // would drop it below every existing folder and then jump it upward on the
  // next reload, which is the behaviour the requirement exists to prevent.
  it('inserts a new folder above the unpinned folders and below the pinned', async () => {
    mockCounts.mockReturnValue(counts({ all: 0 }));
    mockLoadFolders.mockResolvedValue([
      folder('p', 'Pinned', 0),
      folder('u', 'Unpinned'),
    ]);

    const renderer = await renderScreen();
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Create folder' })
        .props.onPress();
    });
    await act(async () => {
      await renderer.root
        .findAllByProps({ testID: 'create-folder-dialog' })
        .filter((node) => typeof node.type !== 'string')[0]
        .props.onSave('Fresh');
    });

    expect(entryNames(renderer)).toEqual([
      'All tracks',
      'Favourites',
      'Pinned',
      'Fresh',
      'Unpinned',
    ]);
    act(() => renderer.unmount());
  });

  it('stamps the new folder the way the store will store it', async () => {
    // Non-empty, so the screen shows the library rather than the empty state
    // (which has no Create folder button).
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));
    mockLoadFolders.mockResolvedValue([]);

    const renderer = await renderScreen();
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Create folder' })
        .props.onPress();
    });
    await act(async () => {
      await renderer.root
        .findAllByProps({ testID: 'create-folder-dialog' })
        .filter((node) => typeof node.type !== 'string')[0]
        .props.onSave('Fresh');
    });

    // insertFolder defaults lastOpenedAt to createdAt. Holding null locally
    // would claim a value the database does not have and sort the folder to
    // the never-opened tail.
    const written = mockInsertFolder.mock.calls[0][0];
    expect(written.lastOpenedAt).toBe(written.createdAt);
    act(() => renderer.unmount());
  });
});

describe('library root folder pinning', () => {
  // Every pin, unpin and move goes through reorderPinnedFolders, which
  // rewrites the whole block in one pass. Per-row writes could leave two
  // folders claiming the same slot after a partial failure.
  function openSheet(renderer: ReactTestRenderer, name: string) {
    const entry = entries(renderer).find((e) => e.entryName === name)!;
    act(() => entry.onOpenActions?.());
    return renderer.root
      .findAllByProps({ testID: 'folder-actions-sheet' })
      .filter((node) => typeof node.type !== 'string')[0];
  }

  it('appends a newly pinned folder to the bottom of the block', async () => {
    mockCounts.mockReturnValue(counts({ all: 0 }));
    mockLoadFolders.mockResolvedValue([
      folder('a', 'Alpha', 0),
      folder('b', 'Beta', 1),
      folder('c', 'Gamma'),
    ]);

    const renderer = await renderScreen();
    const sheet = openSheet(renderer, 'Gamma');
    await act(async () => {
      await sheet.props.onTogglePin();
    });

    // Pinning a third folder must not displace the two already in a
    // deliberate order.
    expect(mockReorderPinned).toHaveBeenCalledWith(['a', 'b', 'c']);
    act(() => renderer.unmount());
  });

  it('closes the gap when a folder is unpinned', async () => {
    mockCounts.mockReturnValue(counts({ all: 0 }));
    mockLoadFolders.mockResolvedValue([
      folder('a', 'Alpha', 0),
      folder('b', 'Beta', 1),
      folder('c', 'Gamma', 2),
    ]);

    const renderer = await renderScreen();
    const sheet = openSheet(renderer, 'Beta');
    await act(async () => {
      await sheet.props.onTogglePin();
    });

    expect(mockReorderPinned).toHaveBeenCalledWith(['a', 'c']);
    act(() => renderer.unmount());
  });

  it('swaps neighbours within the pinned block', async () => {
    mockCounts.mockReturnValue(counts({ all: 0 }));
    mockLoadFolders.mockResolvedValue([
      folder('a', 'Alpha', 0),
      folder('b', 'Beta', 1),
      folder('c', 'Gamma', 2),
    ]);

    const renderer = await renderScreen();
    const up = openSheet(renderer, 'Beta');
    await act(async () => {
      await up.props.onMoveUp();
    });
    expect(mockReorderPinned).toHaveBeenLastCalledWith(['b', 'a', 'c']);

    const down = openSheet(renderer, 'Beta');
    await act(async () => {
      await down.props.onMoveDown();
    });
    expect(mockReorderPinned).toHaveBeenLastCalledWith(['a', 'c', 'b']);
    act(() => renderer.unmount());
  });

  it('marks the pinned rows so their position does not read as arbitrary', async () => {
    mockCounts.mockReturnValue(counts({ all: 0 }));
    mockLoadFolders.mockResolvedValue([
      folder('a', 'Alpha', 0),
      folder('c', 'Gamma'),
    ]);

    const renderer = await renderScreen();

    expect(entries(renderer).find((e) => e.entryName === 'Alpha')?.pinned).toBe(
      true,
    );
    expect(entries(renderer).find((e) => e.entryName === 'Gamma')?.pinned).toBe(
      false,
    );
    act(() => renderer.unmount());
  });

  // A soft cap: the ninth pin still works, because a reader who wants nine
  // has a reason and being refused would be worse than being told.
  it('pins past the soft cap and says why it may not help', async () => {
    const pinned = Array.from({ length: 8 }, (_, i) =>
      folder(`p${i}`, `Pinned ${i}`, i),
    );
    mockCounts.mockReturnValue(counts({ all: 0 }));
    // Listed first only so it falls inside FlatList's initial window; the
    // pinned block's own order comes from pinOrder, not from this array.
    mockLoadFolders.mockResolvedValue([folder('x', 'Extra'), ...pinned]);

    const renderer = await renderScreen();
    const sheet = openSheet(renderer, 'Extra');
    await act(async () => {
      await sheet.props.onTogglePin();
    });

    expect(mockReorderPinned).toHaveBeenCalledWith([
      ...pinned.map((f) => f.id),
      'x',
    ]);
    expect(toastLabels(renderer).join(' ')).toContain('9 folders pinned');
    act(() => renderer.unmount());
  });

  it('says nothing reassuring when the pin lands but the read back fails', async () => {
    mockCounts.mockReturnValue(counts({ all: 0 }));
    mockLoadFolders.mockResolvedValue([folder('c', 'Gamma')]);

    const renderer = await renderScreen();
    const sheet = openSheet(renderer, 'Gamma');
    mockLoadFolders.mockRejectedValueOnce(new Error('db read failed'));
    await act(async () => {
      await sheet.props.onTogglePin();
    });

    // "Folder pinned" on top of "Failed to load library" would contradict
    // itself. The write did land, so neither is a lie — but only one of them
    // tells the reader something they can act on.
    expect(toastLabels(renderer)).toContain('Failed to load library');
    expect(toastLabels(renderer)).not.toContain('Folder pinned');
    act(() => renderer.unmount());
  });

  it('reports a failed pin without claiming it worked', async () => {
    mockCounts.mockReturnValue(counts({ all: 0 }));
    mockLoadFolders.mockResolvedValue([folder('c', 'Gamma')]);
    mockReorderPinned.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    const renderer = await renderScreen();
    const sheet = openSheet(renderer, 'Gamma');
    await act(async () => {
      await sheet.props.onTogglePin();
    });

    expect(toastLabels(renderer)).toContain('Failed to pin folder');
    act(() => renderer.unmount());
  });

  it('persists a new order when DraggablePinnedFolderList drops a reordered sequence', async () => {
    mockCounts.mockReturnValue(counts({ all: 0 }));
    mockLoadFolders.mockResolvedValue([
      folder('a', 'Alpha', 0),
      folder('b', 'Beta', 1),
      folder('c', 'Gamma', 2),
    ]);

    const renderer = await renderScreen();
    const draggable = renderer.root
      .findAllByProps({ testID: 'draggable-pinned-folder-list' })
      .filter((node) => typeof node.type !== 'string')[0];

    await act(async () => {
      await draggable.props.onReorder(['c', 'a', 'b']);
    });

    expect(mockReorderPinned).toHaveBeenCalledWith(['c', 'a', 'b']);
    act(() => renderer.unmount());
  });
});

describe('library root import', () => {
  // At the root the new track is not on screen, so a message that does not
  // say where it went reads as an import that silently failed.
  it('imports into Unfiled and names the destination', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));
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
      expect.objectContaining({ id: 'track-1', folderId: null }),
    );
    expect(toastLabels(renderer)).toContain('Imported song.mp3 to Unfiled');
    act(() => renderer.unmount());
  });

  it('counts the new track against All tracks and Unfiled', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));
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

    expect(entries(renderer).map((e) => [e.entryName, e.trackCount])).toEqual([
      ['All tracks', 2],
      ['Favourites', 0],
      ['Unfiled', 2],
    ]);
    act(() => renderer.unmount());
  });

  it('reports an import failure', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));
    mockPickAndImportFile.mockResolvedValueOnce({
      success: false,
      error: 'unsupported_format',
      message: 'Unsupported file format',
    });

    const renderer = await renderScreen();
    const importButton = renderer.root.findAllByProps({
      testID: 'import-button',
    })[0];
    await act(async () => {
      await importButton.props.onPress();
    });

    expect(toastLabels(renderer)).toContain(
      'Import failed: Unsupported file format',
    );
    act(() => renderer.unmount());
  });

  it('reports a save failure rather than a success', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));
    mockPickAndImportFile.mockResolvedValueOnce({
      success: true,
      track: sampleTrack,
    });
    mockInsertTrack.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const renderer = await renderScreen();
    const importButton = renderer.root.findAllByProps({
      testID: 'import-button',
    })[0];
    await act(async () => {
      await importButton.props.onPress();
    });

    const labels = toastLabels(renderer);
    expect(labels).toContain('Failed to save track to library');
    expect(labels).not.toContain('Imported song.mp3 to Unfiled');
    consoleSpy.mockRestore();
    act(() => renderer.unmount());
  });

  it('offers the import button while the library is still empty', async () => {
    mockPickAndImportFile.mockResolvedValueOnce({
      success: true,
      track: sampleTrack,
    });

    const renderer = await renderScreen();
    expect(entryNames(renderer)).toEqual([]);

    const importButton = renderer.root.findAllByProps({
      testID: 'import-button',
    })[0];
    await act(async () => {
      await importButton.props.onPress();
    });

    expect(toastLabels(renderer)).toContain('Imported song.mp3 to Unfiled');
    act(() => renderer.unmount());
  });
});

describe('library root load and refresh reporting', () => {
  it('reports a failed initial load', async () => {
    mockLoadFolders.mockRejectedValueOnce(new Error('db read failed'));

    const renderer = await renderScreen();

    expect(toastLabels(renderer)).toContain('Failed to load library');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Failed to load library',
    );
    act(() => renderer.unmount());
  });

  it('does not report a load that lands after the screen has gone', async () => {
    let rejectLoad!: (error: Error) => void;
    mockLoadFolders.mockReturnValueOnce(
      new Promise<Folder[]>((_resolve, reject) => {
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
      'Failed to load library',
    );
  });

  it('announces a successful pull-to-refresh', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));

    const renderer = await renderScreen();
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;
    await act(async () => {
      await onRefresh();
    });

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Library refreshed',
    );
    act(() => renderer.unmount());
  });

  it('announces a failed pull-to-refresh', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));

    const renderer = await renderScreen();
    mockLoadFolders.mockRejectedValueOnce(new Error('db read failed'));
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;
    await act(async () => {
      await onRefresh();
    });

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Failed to refresh library',
    );
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalledWith(
      'Library refreshed',
    );
    act(() => renderer.unmount());
  });

  // A read that started before the folder was created holds a snapshot that
  // predates it, so letting it land would drop the folder the reader just made.
  it('keeps a newly created folder when an older read resolves afterwards', async () => {
    mockCounts.mockReturnValue(counts({ all: 1, unfiled: 1 }));
    const renderer = await renderScreen();

    // A pull-to-refresh read is left in flight across the folder creation.
    let resolveLoad!: (folders: Folder[]) => void;
    mockLoadFolders.mockReturnValueOnce(
      new Promise<Folder[]>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;
    let refreshDone!: Promise<void>;
    await act(async () => {
      refreshDone = onRefresh();
    });

    const createButton = renderer.root.findByProps({
      accessibilityLabel: 'Create folder',
    });
    await act(async () => {
      createButton.props.onPress();
    });
    const dialog = renderer.root.findByProps({
      testID: 'create-folder-dialog',
    });
    await act(async () => {
      await dialog.props.onSave('Scales');
    });
    expect(entryNames(renderer)).toContain('Scales');

    await act(async () => {
      resolveLoad([]);
      await refreshDone;
    });

    expect(entryNames(renderer)).toContain('Scales');
    act(() => renderer.unmount());
  });
});

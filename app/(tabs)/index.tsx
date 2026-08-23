import { ComponentProps, useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessiblePressable } from '@/src/components/AccessiblePressable';
import { CenteredDialog } from '@/src/components/CenteredDialog';
import { CreateFolderDialog } from '@/src/components/CreateFolderDialog';
import { DialogButton } from '@/src/components/DialogButton';
import { DraggablePinnedFolderList } from '@/src/components/DraggablePinnedFolderList';
import { FolderActionsSheet } from '@/src/components/FolderActionsSheet';
import { FolderListItem } from '@/src/components/FolderListItem';
import { ImportButton } from '@/src/components/ImportButton';
import { NameEntryDialog } from '@/src/components/NameEntryDialog';
import { SearchBar } from '@/src/components/SearchBar';
import { ToastHost } from '@/src/components/ToastHost';
import { useIsScreenFocused } from '@/src/hooks/useIsScreenFocused';
import { useTheme } from '@/src/hooks/useTheme';
import { useToast } from '@/src/hooks/useToast';
import { useTokenedReload } from '@/src/hooks/useTokenedReload';
import { useTrackImport } from '@/src/hooks/useTrackImport';
import {
  deleteFolder,
  insertFolder,
  loadFolders,
  renameFolder as renameFolderStore,
  reorderPinnedFolders,
} from '@/src/services/folderStore';
import { getTrackCountsByFolder } from '@/src/services/trackStore';
import { spacing } from '@/src/theme';
import { Folder, TrackCounts } from '@/src/types';
import { generateId } from '@/src/utils/generateId';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The library root is a list of folders and nothing else — loose tracks never
 * appear beside them. Above the reader's own folders sit three fixed entries
 * that are queries rather than records: every track, the starred ones, and
 * the ones filed nowhere. They keep a distinct glyph and a fixed position so
 * they do not read as folders that could be renamed or reordered.
 */
type BuiltinKey = 'all' | 'favorites' | 'unfiled';

interface BuiltinEntry {
  key: BuiltinKey;
  name: string;
  icon: IoniconName;
}

const BUILTIN_ENTRIES: readonly BuiltinEntry[] = [
  { key: 'all', name: 'All tracks', icon: 'albums' },
  { key: 'favorites', name: 'Favourites', icon: 'star' },
  { key: 'unfiled', name: 'Unfiled', icon: 'file-tray' },
];

type RootEntry =
  | { type: 'builtin'; entry: BuiltinEntry; count: number }
  | { type: 'pinned-block'; folders: Folder[] }
  | { type: 'folder'; folder: Folder; trackCount: number };

const EMPTY_COUNTS: TrackCounts = {
  byFolder: {},
  all: 0,
  favorites: 0,
  unfiled: 0,
};

/**
 * Past this many pinned folders the pinned block has effectively become the
 * whole list and most-recently-used has nothing left to order. It is a hint,
 * not a limit: pinning a ninth folder still works, because a reader who
 * wants nine has a reason and being refused would be worse than being told.
 */
const PIN_SOFT_CAP = 8;

export default function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const focused = useIsScreenFocused();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [counts, setCounts] = useState<TrackCounts>(EMPTY_COUNTS);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast, showToast, showError, hideToast } = useToast();

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [actionsFolder, setActionsFolder] = useState<Folder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);

  // The folder list and the tallies are read together: a folder row shows
  // its own count, so a list without counts is not a renderable state.
  const loadLibrary = useCallback(
    () => Promise.all([loadFolders(), getTrackCountsByFolder()]),
    [],
  );
  const applyLibrary = useCallback(
    ([loadedFolders, loadedCounts]: [Folder[], TrackCounts]) => {
      setFolders(loadedFolders);
      setCounts(loadedCounts);
    },
    [],
  );

  const { refreshing, handleRefresh, reload, invalidateLoads } =
    useTokenedReload({
      load: loadLibrary,
      onLoaded: applyLibrary,
      onError: showError,
      announcement: 'Library refreshed',
      loadFailureMessage: 'Failed to load library',
      refreshFailureMessage: 'Failed to refresh library',
    });

  // A fresh import lands in Unfiled, which is not a row the root is showing,
  // so nothing on screen would move without nudging the tallies. The reload
  // that follows the next focus replaces these with the real numbers.
  const handleImported = useCallback(() => {
    invalidateLoads();
    setCounts((prev) => ({
      ...prev,
      all: prev.all + 1,
      unfiled: prev.unfiled + 1,
    }));
  }, [invalidateLoads]);

  const { importing, handleImport } = useTrackImport({
    destinationFolderId: null,
    destinationName: 'Unfiled',
    shareEnabled: focused,
    onImported: handleImported,
    showToast,
  });

  const searching = searchQuery.trim().length > 0;

  // Search covers the reader's own folders. The three built-in entries are
  // fixed furniture rather than search results, so they stay put whatever is
  // typed — otherwise a query with no folder matches would leave the reader
  // on a screen with no way back to their tracks.
  const matchingFolders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, searchQuery]);

  const pinnedFolders = useMemo(
    () => (searching ? [] : folders.filter((f) => f.pinOrder !== null)),
    [folders, searching],
  );

  const unpinnedMatchingFolders = useMemo(() => {
    if (searching) return matchingFolders;
    return folders.filter((f) => f.pinOrder === null);
  }, [folders, matchingFolders, searching]);

  const entries = useMemo((): RootEntry[] => {
    const items: RootEntry[] = [];
    for (const entry of BUILTIN_ENTRIES) {
      const count =
        entry.key === 'all'
          ? counts.all
          : entry.key === 'favorites'
            ? counts.favorites
            : counts.unfiled;
      // Unfiled is only meaningful while something is actually unfiled.
      if (entry.key === 'unfiled' && count === 0) continue;
      items.push({ type: 'builtin', entry, count });
    }
    if (pinnedFolders.length > 0) {
      items.push({ type: 'pinned-block', folders: pinnedFolders });
    }
    for (const folder of unpinnedMatchingFolders) {
      items.push({
        type: 'folder',
        folder,
        trackCount: counts.byFolder[folder.id] ?? 0,
      });
    }
    return items;
  }, [pinnedFolders, unpinnedMatchingFolders, counts]);

  const openBuiltin = useCallback(
    (entry: BuiltinEntry) => {
      router.push({
        pathname: '/tracks',
        params: { scope: entry.key, name: entry.name },
      });
    },
    [router],
  );

  const openFolder = useCallback(
    (folder: Folder) => {
      router.push({
        pathname: '/tracks',
        params: { scope: 'folder', folderId: folder.id, name: folder.name },
      });
    },
    [router],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      try {
        const createdAt = Date.now();
        const folder: Folder = {
          id: generateId(),
          name,
          createdAt,
          pinOrder: null,
          // Match what the store actually writes: `insertFolder` defaults
          // this to `createdAt`. Holding null here would claim a value the
          // database does not have, and would sort the folder to the
          // never-opened tail until the next reload moved it.
          lastOpenedAt: createdAt,
        };
        await insertFolder(folder);
        invalidateLoads();
        // A new folder belongs at the top of the unpinned block, not at the
        // end of the list — appending would drop it below the pinned block
        // and every older folder, then jump it upward on the next reload.
        setFolders((prev) => {
          const pinnedCount = prev.filter((f) => f.pinOrder !== null).length;
          return [
            ...prev.slice(0, pinnedCount),
            folder,
            ...prev.slice(pinnedCount),
          ];
        });
        showToast(`Created folder "${name}"`, 'success');
      } catch {
        showError('Failed to create folder');
      }
      setCreatingFolder(false);
    },
    [showToast, invalidateLoads, showError],
  );

  // `loadFolders` already returns pinned folders first, in `pinOrder`, so the
  // pinned ids in list order are just the leading run of pinned rows.
  const pinnedIds = useMemo(
    () => folders.filter((f) => f.pinOrder !== null).map((f) => f.id),
    [folders],
  );

  /**
   * Writes a new pinned block and reads the list back.
   *
   * Every pin, unpin and move goes through `reorderPinnedFolders`, which
   * rewrites the whole block in one pass: each listed id takes its index as
   * its `pinOrder` and everything unlisted is unpinned. Per-row writes would
   * leave a partial failure showing two folders claiming the same slot.
   */
  const writePinnedOrder = useCallback(
    async (orderedIds: string[], failureMessage: string) => {
      try {
        await reorderPinnedFolders(orderedIds);
      } catch {
        showError(failureMessage);
        return false;
      }
      // The write landed, but the read back may not have. `reloadData`
      // reports its own failure, so say nothing further — a success toast on
      // top of "Failed to load library" would contradict it.
      return reload();
    },
    [reload, showError],
  );

  const handleTogglePin = useCallback(
    async (folder: Folder) => {
      const wasPinned = folder.pinOrder !== null;
      // Pinning appends to the bottom. Inserting anywhere else would displace
      // folders the reader has already put in a deliberate order.
      const nextIds = wasPinned
        ? pinnedIds.filter((id) => id !== folder.id)
        : [...pinnedIds, folder.id];

      const ok = await writePinnedOrder(
        nextIds,
        wasPinned ? 'Failed to unpin folder' : 'Failed to pin folder',
      );
      if (!ok) return;

      if (!wasPinned && nextIds.length > PIN_SOFT_CAP) {
        // The pin went through, so this reports success and carries the
        // hint. Refusing the ninth pin would be worse than mentioning it.
        showToast(
          `${nextIds.length} folders pinned — a long pinned block leaves little for recent order to do`,
          'success',
        );
      } else {
        showToast(wasPinned ? 'Folder unpinned' : 'Folder pinned', 'success');
      }
    },
    [pinnedIds, writePinnedOrder, showToast],
  );

  const handleMovePinned = useCallback(
    async (folder: Folder, delta: -1 | 1) => {
      const from = pinnedIds.indexOf(folder.id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= pinnedIds.length) return;
      const nextIds = [...pinnedIds];
      [nextIds[from], nextIds[to]] = [nextIds[to], nextIds[from]];
      await writePinnedOrder(nextIds, 'Failed to reorder folders');
    },
    [pinnedIds, writePinnedOrder],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        await deleteFolder(id);
        showToast('Folder deleted', 'success');
      } catch {
        showError('Failed to delete folder');
        return;
      }
      // Deleting a folder unfiles its tracks, so the tallies move too — read
      // them back rather than guessing.
      await reload();
    },
    [showToast, reload, showError],
  );

  const handleRenameFolder = useCallback(
    async (id: string, newName: string) => {
      try {
        await renameFolderStore(id, newName);
        invalidateLoads();
        setFolders((prev) =>
          prev.map((f) => (f.id === id ? { ...f, name: newName } : f)),
        );
        showToast('Folder renamed', 'success');
      } catch {
        showError('Failed to rename folder');
      }
      setRenamingFolder(null);
    },
    [showToast, invalidateLoads, showError],
  );

  const renderItem = useCallback(
    ({ item }: { item: RootEntry }) => {
      if (item.type === 'builtin') {
        return (
          <FolderListItem
            kind="builtin"
            name={item.entry.name}
            icon={item.entry.icon}
            trackCount={item.count}
            onPress={() => openBuiltin(item.entry)}
            style={styles.listItem}
          />
        );
      }
      if (item.type === 'pinned-block') {
        return (
          <DraggablePinnedFolderList
            folders={item.folders}
            trackCounts={counts.byFolder}
            onOpenFolder={openFolder}
            onOpenActions={(folder) => setActionsFolder(folder)}
            onDeleteFolder={(folder) => setDeletingFolder(folder)}
            onRenameFolder={(folder) =>
              setRenamingFolder({ id: folder.id, name: folder.name })
            }
            onReorder={(orderedIds) => {
              void writePinnedOrder(orderedIds, 'Failed to reorder folders');
            }}
          />
        );
      }
      return (
        <FolderListItem
          name={item.folder.name}
          trackCount={item.trackCount}
          pinned={item.folder.pinOrder !== null}
          onPress={() => openFolder(item.folder)}
          onDelete={() => setDeletingFolder(item.folder)}
          onRename={() =>
            setRenamingFolder({ id: item.folder.id, name: item.folder.name })
          }
          onOpenActions={() => setActionsFolder(item.folder)}
          style={styles.listItem}
        />
      );
    },
    [openBuiltin, openFolder, counts.byFolder, writePinnedOrder],
  );

  const keyExtractor = useCallback((item: RootEntry) => {
    if (item.type === 'builtin') return `b-${item.entry.key}`;
    if (item.type === 'pinned-block') return 'pinned-block';
    return `f-${item.folder.id}`;
  }, []);

  const libraryIsEmpty = counts.all === 0 && folders.length === 0;

  if (libraryIsEmpty) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['bottom']}
      >
        <View style={styles.emptyState}>
          <Text style={[theme.typography.heading, styles.title]}>Refrain</Text>
          <Text style={[theme.typography.body, styles.subtitle]}>
            Your track library is empty.
          </Text>
          <Text style={[theme.typography.caption, styles.hint]}>
            Import audio files to get started.
          </Text>
          <ImportButton
            onPress={handleImport}
            loading={importing}
            style={styles.importButton}
          />
        </View>
        <ToastHost toast={toast} onDismiss={hideToast} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <View style={styles.listContainer}>
        <View style={styles.header}>
          <Text style={theme.typography.heading} numberOfLines={1}>
            Library
          </Text>
          <View style={styles.headerRight}>
            <AccessiblePressable
              accessibilityRole="button"
              accessibilityLabel="Create folder"
              onPress={() => setCreatingFolder(true)}
              style={styles.headerAction}
            >
              <Ionicons
                name="folder-open-outline"
                size={22}
                color={theme.colors.accentForeground}
              />
            </AccessiblePressable>
            <ImportButton onPress={handleImport} loading={importing} />
          </View>
        </View>

        <View style={styles.toolbar}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search folders…"
            accessibilityLabel="Search folders"
          />
        </View>

        {searching && matchingFolders.length === 0 ? (
          <View style={styles.notice}>
            <Text style={theme.typography.body}>No folders match.</Text>
          </View>
        ) : null}

        {!searching && folders.length === 0 ? (
          <View style={styles.notice}>
            <Text style={theme.typography.body}>No folders yet.</Text>
            <Text style={[theme.typography.caption, styles.hint]}>
              Create one to group your tracks.
            </Text>
          </View>
        ) : null}

        <FlatList
          data={entries}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.accentForeground}
              colors={[theme.colors.accentForeground]}
            />
          }
        />
      </View>

      {creatingFolder ? (
        <CreateFolderDialog
          onSave={(name) => void handleCreateFolder(name)}
          onCancel={() => setCreatingFolder(false)}
        />
      ) : null}

      {renamingFolder ? (
        <NameEntryDialog
          title="Rename folder"
          initialName={renamingFolder.name}
          placeholder="Folder name"
          fieldAccessibilityLabel="Folder name"
          confirmAccessibilityLabel={`Confirm rename ${renamingFolder.name}`}
          onConfirm={(name) => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== renamingFolder.name) {
              void handleRenameFolder(renamingFolder.id, trimmed);
            }
            setRenamingFolder(null);
          }}
          onCancel={() => setRenamingFolder(null)}
        />
      ) : null}

      {actionsFolder ? (
        <FolderActionsSheet
          name={actionsFolder.name}
          pinned={actionsFolder.pinOrder !== null}
          canMoveUp={pinnedIds.indexOf(actionsFolder.id) > 0}
          canMoveDown={
            pinnedIds.indexOf(actionsFolder.id) >= 0 &&
            pinnedIds.indexOf(actionsFolder.id) < pinnedIds.length - 1
          }
          onTogglePin={() => void handleTogglePin(actionsFolder)}
          onMoveUp={() => void handleMovePinned(actionsFolder, -1)}
          onMoveDown={() => void handleMovePinned(actionsFolder, 1)}
          onRename={() =>
            setRenamingFolder({
              id: actionsFolder.id,
              name: actionsFolder.name,
            })
          }
          onDelete={() => setDeletingFolder(actionsFolder)}
          onDismiss={() => setActionsFolder(null)}
        />
      ) : null}

      {deletingFolder ? (
        <CenteredDialog
          title={`Delete ${deletingFolder.name}?`}
          // Naming the destination and the count is the whole point: the
          // question a reader needs answered before deleting a folder is
          // what happens to what is inside it. The audio files themselves
          // are never touched — only `deleteTrack` removes those.
          message={
            (counts.byFolder[deletingFolder.id] ?? 0) === 0
              ? 'This folder is empty.'
              : `Its ${counts.byFolder[deletingFolder.id]} ${
                  counts.byFolder[deletingFolder.id] === 1 ? 'track' : 'tracks'
                } move to Unfiled.`
          }
          onDismiss={() => setDeletingFolder(null)}
        >
          <DialogButton
            label="Delete"
            accessibilityLabel={`Confirm delete ${deletingFolder.name}`}
            variant="danger"
            onPress={() => {
              const target = deletingFolder;
              setDeletingFolder(null);
              void handleDeleteFolder(target.id);
            }}
          />
          <DialogButton
            label="Cancel"
            accessibilityLabel="Cancel delete"
            variant="default"
            onPress={() => setDeletingFolder(null)}
          />
        </CenteredDialog>
      ) : null}

      <ToastHost toast={toast} onDismiss={hideToast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    marginBottom: spacing.md,
  },
  subtitle: {
    marginBottom: spacing.xs,
  },
  hint: {
    marginBottom: spacing.xl,
  },
  importButton: {
    marginTop: spacing.lg,
  },
  listContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerAction: {
    padding: spacing.xs,
  },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  notice: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  listItem: {
    marginBottom: spacing.sm,
  },
});

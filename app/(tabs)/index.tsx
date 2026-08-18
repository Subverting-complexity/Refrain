import { ComponentProps, useCallback, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessiblePressable } from '@/src/components/AccessiblePressable';
import { CreateFolderDialog } from '@/src/components/CreateFolderDialog';
import { FolderListItem } from '@/src/components/FolderListItem';
import { ImportButton } from '@/src/components/ImportButton';
import { NameEntryDialog } from '@/src/components/NameEntryDialog';
import { SearchBar } from '@/src/components/SearchBar';
import { ToastHost } from '@/src/components/ToastHost';
import { useIsScreenFocused } from '@/src/hooks/useIsScreenFocused';
import { useTheme } from '@/src/hooks/useTheme';
import { useToast } from '@/src/hooks/useToast';
import { useTrackImport } from '@/src/hooks/useTrackImport';
import {
  deleteFolder,
  insertFolder,
  loadFolders,
  renameFolder as renameFolderStore,
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
  | { type: 'folder'; folder: Folder; trackCount: number };

const EMPTY_COUNTS: TrackCounts = {
  byFolder: {},
  all: 0,
  favorites: 0,
  unfiled: 0,
};

export default function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const focused = useIsScreenFocused();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [counts, setCounts] = useState<TrackCounts>(EMPTY_COUNTS);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast, showToast, hideToast } = useToast();

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Retires reads that are still in flight. A load started before an edit
  // holds a snapshot that predates it, so letting it land would silently
  // undo the edit the reader just made.
  const loadToken = useRef(0);
  const invalidateLoads = useCallback(() => {
    loadToken.current += 1;
    return loadToken.current;
  }, []);

  /**
   * Reads the folder list and the tallies together, and reports either
   * outcome. The token guards both paths, not just the successful one: a read
   * that fails after the reader has moved on must no more raise an error into
   * whatever screen they are now looking at than a slow successful one may
   * overwrite it.
   */
  const reloadData = useCallback(
    async (announceSuccess: boolean, failureMessage: string) => {
      const token = invalidateLoads();
      try {
        const [loadedFolders, loadedCounts] = await Promise.all([
          loadFolders(),
          getTrackCountsByFolder(),
        ]);
        if (loadToken.current !== token) return;
        setFolders(loadedFolders);
        setCounts(loadedCounts);
        if (announceSuccess) {
          AccessibilityInfo.announceForAccessibility('Library refreshed');
        }
      } catch {
        if (loadToken.current !== token) return;
        showToast(failureMessage, 'error');
      }
    },
    [invalidateLoads, showToast],
  );

  useFocusEffect(
    useCallback(() => {
      void reloadData(false, 'Failed to load library');
      return () => {
        loadToken.current += 1;
      };
    }, [reloadData]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reloadData(true, 'Failed to refresh library');
    } finally {
      setRefreshing(false);
    }
  }, [reloadData]);

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

  const { importing, importFile } = useTrackImport({
    destinationFolderId: null,
    destinationName: 'Unfiled',
    shareEnabled: focused,
    onImported: handleImported,
    showToast,
  });

  const handleImport = useCallback(() => {
    void importFile();
  }, [importFile]);

  // Search covers the reader's own folders. The three built-in entries are
  // fixed furniture rather than search results, so they stay put whatever is
  // typed — otherwise a query with no folder matches would leave the reader
  // on a screen with no way back to their tracks.
  const matchingFolders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, searchQuery]);

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
    for (const folder of matchingFolders) {
      items.push({
        type: 'folder',
        folder,
        trackCount: counts.byFolder[folder.id] ?? 0,
      });
    }
    return items;
  }, [matchingFolders, counts]);

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
        const folder: Folder = {
          id: generateId(),
          name,
          createdAt: Date.now(),
          pinOrder: null,
          lastOpenedAt: null,
        };
        await insertFolder(folder);
        invalidateLoads();
        setFolders((prev) => [...prev, folder]);
        showToast(`Created folder "${name}"`, 'success');
      } catch {
        showToast('Failed to create folder', 'error');
      }
      setCreatingFolder(false);
    },
    [showToast, invalidateLoads],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        await deleteFolder(id);
        showToast('Folder deleted', 'success');
      } catch {
        showToast('Failed to delete folder', 'error');
        return;
      }
      // Deleting a folder unfiles its tracks, so the tallies move too — read
      // them back rather than guessing.
      await reloadData(false, 'Failed to load library');
    },
    [showToast, reloadData],
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
        showToast('Failed to rename folder', 'error');
      }
      setRenamingFolder(null);
    },
    [showToast, invalidateLoads],
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
      return (
        <FolderListItem
          name={item.folder.name}
          trackCount={item.trackCount}
          onPress={() => openFolder(item.folder)}
          onDelete={() => void handleDeleteFolder(item.folder.id)}
          onRename={() =>
            setRenamingFolder({ id: item.folder.id, name: item.folder.name })
          }
          style={styles.listItem}
        />
      );
    },
    [openBuiltin, openFolder, handleDeleteFolder],
  );

  const keyExtractor = useCallback(
    (item: RootEntry) =>
      item.type === 'builtin' ? `b-${item.entry.key}` : `f-${item.folder.id}`,
    [],
  );

  const libraryIsEmpty = counts.all === 0 && folders.length === 0;
  const searching = searchQuery.trim().length > 0;

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
                color={theme.colors.accent}
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
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
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

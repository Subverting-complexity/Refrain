import { useCallback, useMemo, useRef, useState } from 'react';
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
import { FolderPickerDialog } from '@/src/components/FolderPickerDialog';
import { ImportButton } from '@/src/components/ImportButton';
import { NameEntryDialog } from '@/src/components/NameEntryDialog';
import { SearchBar } from '@/src/components/SearchBar';
import { SortPicker } from '@/src/components/SortPicker';
import { ToastHost } from '@/src/components/ToastHost';
import { TrackActionsSheet } from '@/src/components/TrackActionsSheet';
import { TrackListItem } from '@/src/components/TrackListItem';
import { TrackRenameDialog } from '@/src/components/TrackRenameDialog';
import { useShareIntent } from '@/src/hooks/useShareIntent';
import { useTheme } from '@/src/hooks/useTheme';
import { useToast } from '@/src/hooks/useToast';
import { pickAndImportFile } from '@/src/services/fileImport';
import {
  deleteFolder,
  insertFolder,
  loadFolders,
  renameFolder as renameFolderStore,
} from '@/src/services/folderStore';
import { getSetting, setSetting } from '@/src/services/settingsStore';
import {
  deleteTrack,
  insertTrack,
  loadTracks,
  renameTrack,
  moveTrackToFolder,
  updateTrackSortOrder,
} from '@/src/services/trackStore';
import { spacing } from '@/src/theme';
import { Folder, SortOption, Track } from '@/src/types';
import { errorMessage } from '@/src/utils/errorMessage';
import { generateId } from '@/src/utils/generateId';

type ListItem =
  | { type: 'folder'; folder: Folder; trackCount: number }
  | { type: 'track'; track: Track };

function sortTracks(tracks: Track[], sort: SortOption): Track[] {
  if (sort === 'manual') return tracks;
  const sorted = [...tracks];
  switch (sort) {
    case 'name-asc':
      sorted.sort((a, b) => a.filename.localeCompare(b.filename));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.filename.localeCompare(a.filename));
      break;
    case 'date-desc':
      sorted.sort((a, b) => b.importedAt - a.importedAt);
      break;
    case 'date-asc':
      sorted.sort((a, b) => a.importedAt - b.importedAt);
      break;
    case 'duration-asc':
      sorted.sort((a, b) => a.durationMs - b.durationMs);
      break;
    case 'duration-desc':
      sorted.sort((a, b) => b.durationMs - a.durationMs);
      break;
    case 'size-asc':
      sorted.sort((a, b) => a.fileSizeBytes - b.fileSizeBytes);
      break;
    case 'size-desc':
      sorted.sort((a, b) => b.fileSizeBytes - a.fileSizeBytes);
      break;
  }
  return sorted;
}

const SORT_SETTING_KEY = 'librarySortOrder';
const VALID_SORTS = new Set<SortOption>([
  'name-asc',
  'name-desc',
  'date-asc',
  'date-desc',
  'duration-asc',
  'duration-desc',
  'size-asc',
  'size-desc',
  'manual',
]);

function readSortSetting(): SortOption {
  const raw = getSetting(SORT_SETTING_KEY);
  if (raw && VALID_SORTS.has(raw as SortOption)) return raw as SortOption;
  return 'date-desc';
}

export default function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Folder[]>([]);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>(readSortSetting);
  const { toast, showToast, hideToast } = useToast();

  // Dialog states
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingTrack, setRenamingTrack] = useState<Track | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [actionsTrack, setActionsTrack] = useState<Track | null>(null);
  const [movingTrack, setMovingTrack] = useState<Track | null>(null);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);

  const loadToken = useRef(0);
  const invalidateLoads = useCallback(() => {
    loadToken.current += 1;
    return loadToken.current;
  }, []);

  const reloadData = useCallback(
    async (folderId: string | null) => {
      const token = invalidateLoads();
      try {
        const [loadedTracks, loadedFolders] = await Promise.all([
          loadTracks(folderId),
          loadFolders(folderId),
        ]);
        if (loadToken.current !== token) return;
        setTracks(loadedTracks);
        setFolders(loadedFolders);
      } catch {
        if (loadToken.current !== token) return;
        showToast('Failed to load library', 'error');
      }
    },
    [showToast, invalidateLoads],
  );

  useFocusEffect(
    useCallback(() => {
      reloadData(currentFolderId);
      return () => {
        loadToken.current += 1;
      };
    }, [reloadData, currentFolderId]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const token = invalidateLoads();
    try {
      const [loadedTracks, loadedFolders] = await Promise.all([
        loadTracks(currentFolderId),
        loadFolders(currentFolderId),
      ]);
      if (loadToken.current !== token) return;
      setTracks(loadedTracks);
      setFolders(loadedFolders);
      AccessibilityInfo.announceForAccessibility('Library refreshed');
    } catch {
      if (loadToken.current !== token) return;
      showToast('Failed to refresh library', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [currentFolderId, showToast, invalidateLoads]);

  const navigateToFolder = useCallback(
    async (folder: Folder) => {
      setFolderPath((prev) => [...prev, folder]);
      setCurrentFolderId(folder.id);
      setSearchQuery('');
      await reloadData(folder.id);
    },
    [reloadData],
  );

  const navigateUp = useCallback(async () => {
    setFolderPath((prev) => {
      const next = prev.slice(0, -1);
      const parentId = next.length > 0 ? next[next.length - 1].id : null;
      setCurrentFolderId(parentId);
      void reloadData(parentId);
      return next;
    });
    setSearchQuery('');
  }, [reloadData]);

  const navigateToRoot = useCallback(async () => {
    setFolderPath([]);
    setCurrentFolderId(null);
    setSearchQuery('');
    await reloadData(null);
  }, [reloadData]);

  // --- Track counts for folders (for display) ---
  const folderTrackCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks) {
      const fid = t.folderId ?? '__root__';
      counts.set(fid, (counts.get(fid) ?? 0) + 1);
    }
    return counts;
  }, [tracks]);

  // --- Search + sort ---
  const filteredItems = useMemo((): ListItem[] => {
    const q = searchQuery.toLowerCase().trim();

    let filteredFolders = folders;
    let filteredTracks = tracks;

    if (q) {
      filteredFolders = folders.filter((f) => f.name.toLowerCase().includes(q));
      filteredTracks = tracks.filter((t) =>
        t.filename.toLowerCase().includes(q),
      );
    }

    const sortedTracks = sortTracks(filteredTracks, sortOption);

    const items: ListItem[] = [];
    for (const f of filteredFolders) {
      items.push({
        type: 'folder',
        folder: f,
        trackCount: folderTrackCounts.get(f.id) ?? 0,
      });
    }
    for (const t of sortedTracks) {
      items.push({ type: 'track', track: t });
    }
    return items;
  }, [folders, tracks, searchQuery, sortOption, folderTrackCounts]);

  // --- CRUD ---
  const addTrack = useCallback(
    async (track: Track): Promise<boolean> => {
      try {
        const trackInFolder = { ...track, folderId: currentFolderId };
        await insertTrack(trackInFolder);
        invalidateLoads();
        setTracks((prev) => [trackInFolder, ...prev]);
        return true;
      } catch (error) {
        console.error('Failed to save track to library', error);
        showToast('Failed to save track to library', 'error');
        return false;
      }
    },
    [showToast, invalidateLoads, currentFolderId],
  );

  const handleRename = useCallback(
    async (id: string, filename: string) => {
      try {
        await renameTrack(id, filename);
        // As in addTrack: retire in-flight reads so one that predates the
        // rename cannot resolve afterwards and restore the old name.
        invalidateLoads();
        // Patch only the filename on the existing entry. Rebuilding the track
        // here would be the one place a rename could quietly lose the duration,
        // format, size or import time the store just preserved.
        setTracks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, filename } : t)),
        );
        showToast(`Renamed to ${filename}`, 'success');
      } catch {
        showToast('Failed to rename track', 'error');
      }
    },
    [showToast, invalidateLoads],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteTrack(id);
        invalidateLoads();
        setTracks((prev) => prev.filter((t) => t.id !== id));
        showToast('Track deleted', 'success');
      } catch {
        showToast('Failed to delete track', 'error');
      }
    },
    [showToast, invalidateLoads],
  );

  const handleMoveTrack = useCallback(
    async (trackId: string, targetFolderId: string | null) => {
      try {
        await moveTrackToFolder(trackId, targetFolderId);
        invalidateLoads();
        setTracks((prev) => prev.filter((t) => t.id !== trackId));
        showToast('Track moved', 'success');
      } catch {
        showToast('Failed to move track', 'error');
      }
      setMovingTrack(null);
    },
    [showToast, invalidateLoads],
  );

  const handleMoveUp = useCallback(
    async (track: Track) => {
      const idx = tracks.findIndex((t) => t.id === track.id);
      if (idx <= 0) return;
      const prev = tracks[idx - 1];
      const newOrder = prev.sortOrder - 1;
      try {
        await updateTrackSortOrder(track.id, newOrder);
        invalidateLoads();
        setTracks((current) => {
          const next = [...current];
          next[idx] = { ...next[idx], sortOrder: newOrder };
          next.sort((a, b) => a.sortOrder - b.sortOrder);
          return next;
        });
      } catch {
        showToast('Failed to reorder', 'error');
      }
    },
    [tracks, showToast, invalidateLoads],
  );

  const handleMoveDown = useCallback(
    async (track: Track) => {
      const idx = tracks.findIndex((t) => t.id === track.id);
      if (idx < 0 || idx >= tracks.length - 1) return;
      const next = tracks[idx + 1];
      const newOrder = next.sortOrder + 1;
      try {
        await updateTrackSortOrder(track.id, newOrder);
        invalidateLoads();
        setTracks((current) => {
          const updated = [...current];
          updated[idx] = { ...updated[idx], sortOrder: newOrder };
          updated.sort((a, b) => a.sortOrder - b.sortOrder);
          return updated;
        });
      } catch {
        showToast('Failed to reorder', 'error');
      }
    },
    [tracks, showToast, invalidateLoads],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      try {
        const folder: Folder = {
          id: generateId(),
          name,
          parentId: currentFolderId,
          createdAt: Date.now(),
          sortOrder: folders.length,
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
    [currentFolderId, folders.length, showToast, invalidateLoads],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        await deleteFolder(id);
        invalidateLoads();
        await reloadData(currentFolderId);
        showToast('Folder deleted', 'success');
      } catch {
        showToast('Failed to delete folder', 'error');
      }
    },
    [showToast, invalidateLoads, reloadData, currentFolderId],
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

  const handleSortChange = useCallback((opt: SortOption) => {
    setSortOption(opt);
    setSetting(SORT_SETTING_KEY, opt);
  }, []);

  const handleTrackPress = useCallback(
    (track: Track) => {
      router.push({
        pathname: '/player',
        params: { filename: track.filename, trackId: track.id },
      });
    },
    [router],
  );

  const handleTrackLongPress = useCallback((track: Track) => {
    setActionsTrack(track);
  }, []);

  const openMoveToFolder = useCallback(async (track: Track) => {
    try {
      const all = await loadFolders(null);
      setAllFolders(all);
    } catch {
      setAllFolders([]);
    }
    setMovingTrack(track);
  }, []);

  const handleShareImport = useCallback(
    async (track: Track) => {
      if (!(await addTrack(track))) return;
      showToast(`Received ${track.filename} from share`, 'success');
    },
    [addTrack, showToast],
  );

  const handleShareError = useCallback(
    (message: string) => {
      showToast(`Share import failed: ${message}`, 'error');
    },
    [showToast],
  );

  useShareIntent({
    onTrackImported: handleShareImport,
    onError: handleShareError,
  });

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const result = await pickAndImportFile();
      if (result.success) {
        if (!(await addTrack(result.track))) return;
        showToast(`Imported ${result.track.filename} successfully`, 'success');
      } else if (result.error !== 'cancelled') {
        showToast(`Import failed: ${result.message}`, 'error');
      }
    } catch (error) {
      showToast(`Import failed: ${errorMessage(error)}`, 'error');
    } finally {
      setImporting(false);
    }
  }, [addTrack, showToast]);

  const isEmpty = tracks.length === 0 && folders.length === 0;
  const isRoot = currentFolderId === null;

  const renderItem = useCallback(
    ({ item, index }: { item: ListItem; index: number }) => {
      if (item.type === 'folder') {
        return (
          <FolderListItem
            folder={item.folder}
            trackCount={item.trackCount}
            onPress={navigateToFolder}
            onDelete={handleDeleteFolder}
            onRename={(id, name) => setRenamingFolder({ id, name })}
            style={styles.listItem}
          />
        );
      }
      return (
        <TrackListItem
          track={item.track}
          onPress={handleTrackPress}
          onRename={handleRename}
          onDelete={handleDelete}
          onLongPress={handleTrackLongPress}
          style={styles.listItem}
        />
      );
    },
    [
      navigateToFolder,
      handleDeleteFolder,
      handleTrackPress,
      handleRename,
      handleDelete,
      handleTrackLongPress,
    ],
  );

  const keyExtractor = useCallback(
    (item: ListItem) =>
      item.type === 'folder' ? `f-${item.folder.id}` : `t-${item.track.id}`,
    [],
  );

  const currentFolderName =
    folderPath.length > 0 ? folderPath[folderPath.length - 1].name : 'Library';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      {isEmpty && isRoot ? (
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
      ) : (
        <View style={styles.listContainer}>
          {/* Header with navigation */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {!isRoot ? (
                <AccessiblePressable
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  onPress={navigateUp}
                  style={styles.backButton}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={theme.colors.accent}
                  />
                </AccessiblePressable>
              ) : null}
              <Text
                style={theme.typography.heading}
                numberOfLines={1}
                onPress={!isRoot ? navigateToRoot : undefined}
              >
                {currentFolderName}
              </Text>
            </View>
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

          {/* Search + sort bar */}
          <View style={styles.toolbar}>
            <View style={styles.searchWrapper}>
              <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
            </View>
            <SortPicker value={sortOption} onChange={handleSortChange} />
          </View>

          {/* Breadcrumb path */}
          {!isRoot ? (
            <View style={styles.breadcrumb}>
              <AccessiblePressable
                accessibilityRole="link"
                accessibilityLabel="Go to library root"
                onPress={navigateToRoot}
              >
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.accent },
                  ]}
                >
                  Library
                </Text>
              </AccessiblePressable>
              {folderPath.map((f, i) => (
                <View key={f.id} style={styles.breadcrumbSegment}>
                  <Text style={theme.typography.caption}> / </Text>
                  {i < folderPath.length - 1 ? (
                    <AccessiblePressable
                      accessibilityRole="link"
                      accessibilityLabel={`Go to ${f.name}`}
                      onPress={() => {
                        const newPath = folderPath.slice(0, i + 1);
                        setFolderPath(newPath);
                        setCurrentFolderId(f.id);
                        setSearchQuery('');
                        void reloadData(f.id);
                      }}
                    >
                      <Text
                        style={[
                          theme.typography.caption,
                          { color: theme.colors.accent },
                        ]}
                      >
                        {f.name}
                      </Text>
                    </AccessiblePressable>
                  ) : (
                    <Text style={theme.typography.caption}>{f.name}</Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}

          {/* Empty folder state */}
          {isEmpty && !isRoot ? (
            <View style={styles.emptyFolder}>
              <Text style={theme.typography.body}>This folder is empty.</Text>
              <Text style={[theme.typography.caption, styles.hint]}>
                Import tracks or move existing ones here.
              </Text>
            </View>
          ) : null}

          <FlatList
            data={filteredItems}
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
      )}

      {/* --- Dialogs --- */}
      {creatingFolder ? (
        <CreateFolderDialog
          onSave={handleCreateFolder}
          onCancel={() => setCreatingFolder(false)}
        />
      ) : null}

      {renamingTrack ? (
        <TrackRenameDialog
          currentFilename={renamingTrack.filename}
          onSave={(filename) => {
            handleRename(renamingTrack.id, filename);
            setRenamingTrack(null);
          }}
          onCancel={() => setRenamingTrack(null)}
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
              handleRenameFolder(renamingFolder.id, trimmed);
            }
            setRenamingFolder(null);
          }}
          onCancel={() => setRenamingFolder(null)}
        />
      ) : null}

      {actionsTrack ? (
        <TrackActionsSheet
          track={actionsTrack}
          canMoveUp={tracks.indexOf(actionsTrack) > 0}
          canMoveDown={tracks.indexOf(actionsTrack) < tracks.length - 1}
          onRename={() => setRenamingTrack(actionsTrack)}
          onMoveUp={() => handleMoveUp(actionsTrack)}
          onMoveDown={() => handleMoveDown(actionsTrack)}
          onMoveToFolder={() => openMoveToFolder(actionsTrack)}
          onDelete={() => handleDelete(actionsTrack.id)}
          onDismiss={() => setActionsTrack(null)}
        />
      ) : null}

      {movingTrack ? (
        <FolderPickerDialog
          folders={allFolders}
          currentFolderId={movingTrack.folderId}
          onSelect={(fid) => handleMoveTrack(movingTrack.id, fid)}
          onCancel={() => setMovingTrack(null)}
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerAction: {
    padding: spacing.xs,
  },
  backButton: {
    marginRight: spacing.xs,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchWrapper: {
    flex: 1,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  breadcrumbSegment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyFolder: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  listItem: {
    marginBottom: spacing.sm,
  },
});

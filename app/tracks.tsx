import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FolderPickerDialog } from '@/src/components/FolderPickerDialog';
import { ImportButton } from '@/src/components/ImportButton';
import { SearchBar } from '@/src/components/SearchBar';
import { SortPicker } from '@/src/components/SortPicker';
import { ToastHost } from '@/src/components/ToastHost';
import { TrackActionsSheet } from '@/src/components/TrackActionsSheet';
import { TrackListItem } from '@/src/components/TrackListItem';
import { TrackRenameDialog } from '@/src/components/TrackRenameDialog';
import { useIsScreenFocused } from '@/src/hooks/useIsScreenFocused';
import { useTheme } from '@/src/hooks/useTheme';
import { useToast } from '@/src/hooks/useToast';
import { useTrackImport } from '@/src/hooks/useTrackImport';
import { loadFolders, markFolderOpened } from '@/src/services/folderStore';
import { getSetting, setSetting } from '@/src/services/settingsStore';
import {
  deleteTrack,
  loadTracks,
  moveTrackToFolder,
  renameTrack,
} from '@/src/services/trackStore';
import { spacing } from '@/src/theme';
import { Folder, LoadTracksOptions, SortOption, Track } from '@/src/types';

/**
 * Tracks belonging to one library entry, and only tracks — a folder row can
 * never appear here, which is what makes a single sort order over the list
 * meaningful.
 *
 * The entry is named by route parameters rather than by a dynamic segment,
 * so the three built-in entries (`all`, `favorites`, `unfiled`) cannot be
 * confused with a real folder whose id happened to read the same way. The
 * display name travels with them because it is already known at the moment
 * the reader taps, which saves a read and the title flash that would follow
 * one.
 */
type ScopeKind = LoadTracksOptions['scope'];

const SCOPE_KINDS: readonly ScopeKind[] = [
  'all',
  'favorites',
  'unfiled',
  'folder',
];

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
]);

function readSortSetting(): SortOption {
  const raw = getSetting(SORT_SETTING_KEY);
  if (raw && VALID_SORTS.has(raw as SortOption)) return raw as SortOption;
  return 'date-desc';
}

function sortTracks(tracks: Track[], sort: SortOption): Track[] {
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

/** Route parameters arrive as a string or a repeated string; take the first. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function emptyMessage(scope: ScopeKind): string {
  switch (scope) {
    case 'favorites':
      return 'Nothing starred yet.';
    case 'unfiled':
      return 'Every track is filed in a folder.';
    case 'folder':
      return 'This folder is empty.';
    default:
      return 'No tracks yet.';
  }
}

export default function TracksScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const focused = useIsScreenFocused();
  const params = useLocalSearchParams<{
    scope?: string | string[];
    folderId?: string | string[];
    name?: string | string[];
  }>();

  const folderId = firstParam(params.folderId) ?? null;
  const requestedScope = firstParam(params.scope);
  // An unrecognised scope, or a folder scope with no folder to open, falls
  // back to every track. That is the one view that is always safe to show.
  const scope: ScopeKind =
    SCOPE_KINDS.includes(requestedScope as ScopeKind) &&
    (requestedScope !== 'folder' || folderId !== null)
      ? (requestedScope as ScopeKind)
      : 'all';
  const title = firstParam(params.name) ?? 'All tracks';

  const [tracks, setTracks] = useState<Track[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>(readSortSetting);
  const { toast, showToast, hideToast } = useToast();

  const [renamingTrack, setRenamingTrack] = useState<Track | null>(null);
  const [actionsTrack, setActionsTrack] = useState<Track | null>(null);
  const [movingTrack, setMovingTrack] = useState<Track | null>(null);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);

  // Same hazard as the library root: a read started before an edit holds a
  // snapshot that predates it, so it must not be allowed to land afterwards.
  const loadToken = useRef(0);
  const invalidateLoads = useCallback(() => {
    loadToken.current += 1;
    return loadToken.current;
  }, []);

  const loadOptions = useMemo((): LoadTracksOptions => {
    if (scope === 'folder' && folderId !== null) {
      return { scope: 'folder', folderId };
    }
    return { scope: scope === 'folder' ? 'all' : scope };
  }, [scope, folderId]);

  /**
   * Reads this entry's tracks and reports either outcome. The token guards
   * the failure path as well as the successful one: a read that fails after
   * the reader has left must not raise an error into whatever screen they
   * moved on to.
   */
  const reloadData = useCallback(
    async (announceSuccess: boolean, failureMessage: string) => {
      const token = invalidateLoads();
      try {
        const loaded = await loadTracks(loadOptions);
        if (loadToken.current !== token) return;
        setTracks(loaded);
        if (announceSuccess) {
          AccessibilityInfo.announceForAccessibility('Tracks refreshed');
        }
      } catch {
        if (loadToken.current !== token) return;
        showToast(failureMessage, 'error');
      }
    },
    [invalidateLoads, loadOptions, showToast],
  );

  useFocusEffect(
    useCallback(() => {
      void reloadData(false, 'Failed to load tracks');
      return () => {
        loadToken.current += 1;
      };
    }, [reloadData]),
  );

  // Opening a real folder is what orders the unpinned block on the root, so
  // stamp it once per visit. A folder that opens but is not stamped is still
  // open, so a failure here must never surface or block anything.
  const stampedFolderRef = useRef<string | null>(null);
  useEffect(() => {
    if (scope !== 'folder' || folderId === null) return;
    if (stampedFolderRef.current === folderId) return;
    stampedFolderRef.current = folderId;
    void (async () => {
      try {
        await markFolderOpened(folderId, Date.now());
      } catch {
        // Ordering hint only.
      }
    })();
  }, [scope, folderId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reloadData(true, 'Failed to refresh tracks');
    } finally {
      setRefreshing(false);
    }
  }, [reloadData]);

  // Import lands in the folder being viewed, and nowhere else — the built-in
  // entries are queries, not places, so an import made from one goes to
  // Unfiled.
  const destinationFolderId = scope === 'folder' ? folderId : null;
  const destinationName = scope === 'folder' ? title : 'Unfiled';

  const handleImported = useCallback(
    (track: Track) => {
      invalidateLoads();
      // A newly imported track is never starred, so it does not belong in
      // Favourites even though the import itself succeeded.
      if (scope === 'favorites') return;
      setTracks((prev) => [track, ...prev]);
    },
    [scope, invalidateLoads],
  );

  const { importing, importFile } = useTrackImport({
    destinationFolderId,
    destinationName,
    shareEnabled: focused,
    onImported: handleImported,
    showToast,
  });

  const handleImport = useCallback(() => {
    void importFile();
  }, [importFile]);

  const visibleTracks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? tracks.filter((t) => t.filename.toLowerCase().includes(q))
      : tracks;
    return sortTracks(filtered, sortOption);
  }, [tracks, searchQuery, sortOption]);

  const handleRename = useCallback(
    async (id: string, filename: string) => {
      try {
        await renameTrack(id, filename);
        invalidateLoads();
        // Patch only the filename. Rebuilding the track here would be the one
        // place a rename could quietly lose the duration, format, size or
        // import time the store just preserved.
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
        // A move only takes a track off this screen when the screen is a
        // single folder; All tracks still holds it, and Favourites and
        // Unfiled are decided by fields a move does not touch.
        if (scope === 'folder' && targetFolderId !== folderId) {
          setTracks((prev) => prev.filter((t) => t.id !== trackId));
        } else if (scope === 'unfiled' && targetFolderId !== null) {
          setTracks((prev) => prev.filter((t) => t.id !== trackId));
        } else {
          setTracks((prev) =>
            prev.map((t) =>
              t.id === trackId ? { ...t, folderId: targetFolderId } : t,
            ),
          );
        }
        showToast('Track moved', 'success');
      } catch {
        showToast('Failed to move track', 'error');
      }
      setMovingTrack(null);
    },
    [showToast, invalidateLoads, scope, folderId],
  );

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
      setAllFolders(await loadFolders());
    } catch {
      setAllFolders([]);
    }
    setMovingTrack(track);
  }, []);

  const handleSortChange = useCallback((opt: SortOption) => {
    setSortOption(opt);
    setSetting(SORT_SETTING_KEY, opt);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Track }) => (
      <TrackListItem
        track={item}
        onPress={handleTrackPress}
        onRename={(id, filename) => void handleRename(id, filename)}
        onDelete={(id) => void handleDelete(id)}
        onLongPress={handleTrackLongPress}
        style={styles.listItem}
      />
    ),
    [handleTrackPress, handleRename, handleDelete, handleTrackLongPress],
  );

  const keyExtractor = useCallback((item: Track) => item.id, []);

  const searching = searchQuery.trim().length > 0;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <Stack.Screen options={{ title }} />

      <View style={styles.header}>
        <Text style={theme.typography.heading} numberOfLines={1}>
          {title}
        </Text>
        <ImportButton onPress={handleImport} loading={importing} />
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchWrapper}>
          <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
        </View>
        <SortPicker value={sortOption} onChange={handleSortChange} />
      </View>

      {visibleTracks.length === 0 ? (
        <View style={styles.notice}>
          <Text style={theme.typography.body}>
            {searching ? 'No tracks match.' : emptyMessage(scope)}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={visibleTracks}
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

      {renamingTrack ? (
        <TrackRenameDialog
          currentFilename={renamingTrack.filename}
          onSave={(filename) => {
            void handleRename(renamingTrack.id, filename);
            setRenamingTrack(null);
          }}
          onCancel={() => setRenamingTrack(null)}
        />
      ) : null}

      {actionsTrack ? (
        <TrackActionsSheet
          track={actionsTrack}
          onRename={() => setRenamingTrack(actionsTrack)}
          onMoveToFolder={() => void openMoveToFolder(actionsTrack)}
          onDelete={() => void handleDelete(actionsTrack.id)}
          onDismiss={() => setActionsTrack(null)}
        />
      ) : null}

      {movingTrack ? (
        <FolderPickerDialog
          folders={allFolders}
          currentFolderId={movingTrack.folderId}
          onSelect={(fid) => void handleMoveTrack(movingTrack.id, fid)}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
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
  notice: {
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

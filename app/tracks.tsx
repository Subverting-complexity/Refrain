import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CenteredDialog } from '@/src/components/CenteredDialog';
import { CreateFolderDialog } from '@/src/components/CreateFolderDialog';
import { DialogButton } from '@/src/components/DialogButton';
import { FolderPickerDialog } from '@/src/components/FolderPickerDialog';
import { ImportButton } from '@/src/components/ImportButton';
import { SearchBar } from '@/src/components/SearchBar';
import { ToastHost } from '@/src/components/ToastHost';
import { TrackActionsSheet } from '@/src/components/TrackActionsSheet';
import { TrackListItem } from '@/src/components/TrackListItem';
import { TrackRenameDialog } from '@/src/components/TrackRenameDialog';
import { TrackSortBar } from '@/src/components/TrackSortBar';
import { useIsScreenFocused } from '@/src/hooks/useIsScreenFocused';
import { useTheme } from '@/src/hooks/useTheme';
import { useToast } from '@/src/hooks/useToast';
import { useTokenedReload } from '@/src/hooks/useTokenedReload';
import { useTrackImport } from '@/src/hooks/useTrackImport';
import {
  insertFolder,
  loadFolders,
  markFolderOpened,
} from '@/src/services/folderStore';
import { newFolder } from '@/src/services/folderStoreHelpers';
import { getSetting, setSetting } from '@/src/services/settingsStore';
import {
  deleteTrack,
  loadTracks,
  moveTrackToFolder,
  renameTrack,
  setTrackFavorite,
} from '@/src/services/trackStore';
import { spacing } from '@/src/theme';
import { Folder, LoadTracksOptions, SortOption, Track } from '@/src/types';
import {
  parseSortOption,
  serializeSortOption,
  sortTracks,
  unplayedBoundary,
} from '@/src/utils/librarySort';

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

// The stored value is global and survives restart: one ordering for every
// folder, so moving between them never silently re-sorts the list.
const SORT_SETTING_KEY = 'librarySortOrder';

function readSortSetting(): SortOption {
  return parseSortOption(getSetting(SORT_SETTING_KEY));
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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>(readSortSetting);
  // Deliberately not persisted, and reset on entering any folder below. A
  // filter that survives navigation hides rows rather than reordering them,
  // so a forgotten one reads as data loss rather than as a filter.
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { toast, showToast, showError, showSuccess, hideToast } = useToast();

  const [renamingTrack, setRenamingTrack] = useState<Track | null>(null);
  const [actionsTrack, setActionsTrack] = useState<Track | null>(null);
  // Deleting from the actions sheet needs its own confirmation. The swipe
  // path gets one from TrackListItem, but the sheet reaches `handleDelete`
  // directly, so without this a single tap would destroy the audio file
  // with nothing to undo it.
  const [deletingTrack, setDeletingTrack] = useState<Track | null>(null);
  const [movingTrack, setMovingTrack] = useState<Track | null>(null);
  // The track waiting on a folder that does not exist yet. Held separately
  // from `movingTrack` so the picker is closed while the name is typed
  // rather than stacked underneath a second dialog.
  const [filingIntoNewFolder, setFilingIntoNewFolder] = useState<Track | null>(
    null,
  );
  const [allFolders, setAllFolders] = useState<Folder[]>([]);

  const loadOptions = useMemo((): LoadTracksOptions => {
    if (scope === 'folder' && folderId !== null) {
      return { scope: 'folder', folderId };
    }
    return { scope: scope === 'folder' ? 'all' : scope };
  }, [scope, folderId]);

  const loadTracksForEntry = useCallback(
    () => loadTracks(loadOptions),
    [loadOptions],
  );
  const { refreshing, handleRefresh, invalidateLoads } = useTokenedReload({
    load: loadTracksForEntry,
    onLoaded: setTracks,
    onError: showError,
    announcement: 'Tracks refreshed',
    loadFailureMessage: 'Failed to load tracks',
    refreshFailureMessage: 'Failed to refresh tracks',
  });

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

  const { importing, handleImport } = useTrackImport({
    destinationFolderId,
    destinationName,
    shareEnabled: focused,
    onImported: handleImported,
    showToast,
  });

  // Inside Favourites every row is already starred, so the filter would be a
  // no-op and the star is hidden.
  const canFilterFavorites = scope !== 'favorites';

  // Entering a different entry clears the filter. Scoped to the entry being
  // viewed rather than to mount, because the screen is reused across
  // navigations.
  //
  // Adjusted during render rather than in an effect: an effect would paint
  // one frame of the previous entry's filtered list before clearing it, and
  // resetting state on a changed input is what this pattern is for.
  const entryKey = `${scope}:${folderId ?? ''}`;
  const [filteredEntryKey, setFilteredEntryKey] = useState(entryKey);
  if (filteredEntryKey !== entryKey) {
    setFilteredEntryKey(entryKey);
    setFavoritesOnly(false);
  }

  const visibleTracks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let filtered = q
      ? tracks.filter((t) => t.filename.toLowerCase().includes(q))
      : tracks;
    if (favoritesOnly && canFilterFavorites) {
      filtered = filtered.filter((t) => t.isFavorite);
    }
    return sortTracks(filtered, sortOption);
  }, [tracks, searchQuery, sortOption, favoritesOnly, canFilterFavorites]);

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
        showSuccess(`Renamed to ${filename}`);
      } catch {
        showError('Failed to rename track');
      }
    },
    [invalidateLoads, showError, showSuccess],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteTrack(id);
        invalidateLoads();
        setTracks((prev) => prev.filter((t) => t.id !== id));
        showSuccess('Track deleted');
      } catch {
        showError('Failed to delete track');
      }
    },
    [invalidateLoads, showError, showSuccess],
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
        showSuccess('Track moved');
      } catch {
        showError('Failed to move track');
      }
      setMovingTrack(null);
    },
    [invalidateLoads, scope, folderId, showError, showSuccess],
  );

  /**
   * Makes a folder and files the track into it in one step.
   *
   * Creating the folder and moving the track are reported separately on
   * purpose: if the move fails the folder still exists, and saying only
   * "failed to move" would leave the reader hunting for a folder they were
   * never told had been made.
   */
  const handleCreateFolderForTrack = useCallback(
    async (track: Track, name: string) => {
      const folder = newFolder(name);
      try {
        await insertFolder(folder);
      } catch {
        showError('Failed to create folder');
        setFilingIntoNewFolder(null);
        return;
      }
      setFilingIntoNewFolder(null);
      await handleMoveTrack(track.id, folder.id);
    },
    [handleMoveTrack, showError],
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

  const handleOpenTrackActions = useCallback((track: Track) => {
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
    setSetting(SORT_SETTING_KEY, serializeSortOption(opt));
  }, []);

  const handleToggleFavorite = useCallback(
    async (track: Track) => {
      const next = !track.isFavorite;
      // Leaves the row out of the list rather than patching it, when the row
      // no longer belongs in the view it is in.
      const dropsFromView = scope === 'favorites' && !next;

      const applyLocally = (isFavorite: boolean) => {
        if (dropsFromView) {
          // Unstarring inside Favourites takes the row out of the view it is
          // in. Removing it now, with the toast to say what happened, reads
          // as the action working; leaving it until the next load reads as
          // the tap having missed.
          setTracks((prev) =>
            isFavorite
              ? // Restoring: only if the row is not already back. A reload
                // that landed mid-write may have re-added it, and appending
                // blind would put two rows with the same key in the list.
                //
                // This is the one path that re-inserts the captured track
                // rather than patching a live one, because there is no live
                // one left to patch. A rename landing in the same window
                // would be reverted on screen until the next read; narrow
                // enough to accept, and the alternative is leaving the row
                // out of a view it belongs in.
                prev.some((t) => t.id === track.id)
                ? prev
                : [...prev, { ...track, isFavorite }]
              : prev.filter((t) => t.id !== track.id),
          );
          return;
        }
        setTracks((prev) =>
          prev.map((t) => (t.id === track.id ? { ...t, isFavorite } : t)),
        );
      };

      invalidateLoads();
      applyLocally(next);

      try {
        await setTrackFavorite(track.id, next);
      } catch {
        // Put it back the way it was rather than leaving the row showing a
        // state the database does not hold.
        invalidateLoads();
        applyLocally(track.isFavorite);
        showError('Failed to update favourite');
        return;
      }

      // Settle the local state a second time, and not only by retiring reads.
      // On web the write is asynchronous, so a read can begin *during* it and
      // still see the old value. Bumping the token discards such a read that
      // has yet to land — but one that already landed has overwritten the
      // optimistic update, and only re-applying puts it right. Without this,
      // a refresh timed inside the write leaves the row on screen looking
      // untouched moments after the toast said otherwise.
      invalidateLoads();
      applyLocally(next);
      showSuccess(next ? 'Added to favourites' : 'Removed from favourites');
    },
    [scope, invalidateLoads, showError, showSuccess],
  );

  // Where the never-played tracks begin, under the Played sort. Marking the
  // boundary is what makes their fixed position read as deliberate — an
  // unlabelled block that ignores the direction you just reversed reads as
  // the sort having failed.
  const unplayedAt = useMemo(
    () => unplayedBoundary(visibleTracks, sortOption),
    [visibleTracks, sortOption],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <>
        {index === unplayedAt ? (
          <View style={styles.divider}>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: theme.colors.border },
              ]}
            />
            <Text style={theme.typography.caption}>Not played yet</Text>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: theme.colors.border },
              ]}
            />
          </View>
        ) : null}
        <TrackListItem
          track={item}
          onPress={handleTrackPress}
          onDelete={(id) => void handleDelete(id)}
          onToggleFavorite={(track) => void handleToggleFavorite(track)}
          onOpenActions={handleOpenTrackActions}
          style={styles.listItem}
        />
      </>
    ),
    [
      handleTrackPress,
      handleDelete,
      handleToggleFavorite,
      handleOpenTrackActions,
      unplayedAt,
      theme,
    ],
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
        <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
      </View>

      <View style={styles.sortBar}>
        <TrackSortBar
          value={sortOption}
          onChange={handleSortChange}
          favoritesOnly={favoritesOnly}
          onToggleFavorites={() => setFavoritesOnly((on) => !on)}
          showFavoritesFilter={canFilterFavorites}
        />
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
            tintColor={theme.colors.accentForeground}
            colors={[theme.colors.accentForeground]}
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
          onToggleFavorite={() => void handleToggleFavorite(actionsTrack)}
          onMoveToFolder={() => void openMoveToFolder(actionsTrack)}
          onDelete={() => setDeletingTrack(actionsTrack)}
          onDismiss={() => setActionsTrack(null)}
        />
      ) : null}

      {movingTrack ? (
        <FolderPickerDialog
          folders={allFolders}
          currentFolderId={movingTrack.folderId}
          onSelect={(fid) => void handleMoveTrack(movingTrack.id, fid)}
          onCreateFolder={() => {
            setFilingIntoNewFolder(movingTrack);
            setMovingTrack(null);
          }}
          onCancel={() => setMovingTrack(null)}
        />
      ) : null}

      {filingIntoNewFolder ? (
        <CreateFolderDialog
          onSave={(name) =>
            void handleCreateFolderForTrack(filingIntoNewFolder, name)
          }
          // Backing out of naming a folder returns to the picker rather
          // than abandoning the move: the reader asked to file this track,
          // and only changed their mind about making a new folder for it.
          onCancel={() => {
            setMovingTrack(filingIntoNewFolder);
            setFilingIntoNewFolder(null);
          }}
        />
      ) : null}

      {deletingTrack ? (
        <CenteredDialog
          title="Delete track?"
          message={`Remove “${deletingTrack.filename}” from your library?`}
          onDismiss={() => setDeletingTrack(null)}
        >
          <DialogButton
            label="Delete"
            accessibilityLabel={`Confirm delete ${deletingTrack.filename}`}
            variant="danger"
            onPress={() => {
              const target = deletingTrack;
              setDeletingTrack(null);
              void handleDelete(target.id);
            }}
          />
          <DialogButton
            label="Cancel"
            accessibilityLabel="Cancel delete"
            variant="default"
            onPress={() => setDeletingTrack(null)}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sortBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
});

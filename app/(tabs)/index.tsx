import { useCallback, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImportButton } from '@/src/components/ImportButton';
import { ToastHost } from '@/src/components/ToastHost';
import { TrackListItem } from '@/src/components/TrackListItem';
import { useShareIntent } from '@/src/hooks/useShareIntent';
import { useTheme } from '@/src/hooks/useTheme';
import { useToast } from '@/src/hooks/useToast';
import { pickAndImportFile } from '@/src/services/fileImport';
import {
  deleteTrack,
  insertTrack,
  loadTracks,
} from '@/src/services/trackStore';
import { spacing } from '@/src/theme';
import { Track } from '@/src/types';
import { errorMessage } from '@/src/utils/errorMessage';

export default function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  // Every library read is stamped with a token and applied only while that
  // token is still current. `loadTracks` is fully asynchronous on web
  // (IndexedDB, plus a blob-URL resolve per track), so a read can easily land
  // after the list has moved on. A blur-scoped flag covers refocusing, but not
  // the two cases where the list changes *during* a single focus:
  //
  //   - an import or delete made while a read is in flight — the read predates
  //     the change, so applying it drops the new track (or resurrects the
  //     deleted one) until the next refresh;
  //   - pull-to-refresh overlapping the focus read, where whichever resolves
  //     last wins regardless of which started last.
  //
  // Bumping the token on every read and every mutation makes any superseded
  // read a no-op, which also subsumes the blur/unmount case.
  const loadToken = useRef(0);
  const invalidateLoads = useCallback(() => {
    loadToken.current += 1;
    return loadToken.current;
  }, []);

  useFocusEffect(
    useCallback(() => {
      const token = invalidateLoads();
      loadTracks()
        .then((loaded) => {
          if (loadToken.current !== token) return;
          setTracks(loaded);
        })
        .catch(() => {
          if (loadToken.current !== token) return;
          showToast('Failed to load library', 'error');
        });
      return () => {
        loadToken.current += 1;
      };
    }, [showToast, invalidateLoads]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const token = invalidateLoads();
    try {
      const loaded = await loadTracks();
      if (loadToken.current !== token) return;
      setTracks(loaded);
      // Announced rather than toasted: the RefreshControl spinner is the
      // sighted user's confirmation, so a banner here would be redundant.
      AccessibilityInfo.announceForAccessibility('Library refreshed');
    } catch {
      if (loadToken.current !== token) return;
      showToast('Failed to refresh library', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [showToast, invalidateLoads]);

  const addTrack = useCallback(
    async (track: Track): Promise<boolean> => {
      try {
        await insertTrack(track);
        // Retire any in-flight read before the optimistic insert, so a read
        // that started before this track existed cannot resolve afterwards
        // and drop it from the list.
        invalidateLoads();
        setTracks((prev) => [track, ...prev]);
        return true;
      } catch (error) {
        // Surface the underlying error: the persist path (expo-sqlite) can
        // fail for reasons the toast can't convey (schema mismatch, worker
        // error). Logging it makes those failures diagnosable.
        console.error('Failed to save track to library', error);
        showToast('Failed to save track to library', 'error');
        return false;
      }
    },
    [showToast, invalidateLoads],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteTrack(id);
        // As in addTrack: retire in-flight reads so a stale one cannot
        // resurrect the deleted track.
        invalidateLoads();
        setTracks((prev) => prev.filter((t) => t.id !== id));
        showToast('Track deleted', 'success');
      } catch {
        showToast('Failed to delete track', 'error');
      }
    },
    [showToast, invalidateLoads],
  );

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

  const handleTrackPress = useCallback(
    (track: Track) => {
      router.push({
        pathname: '/player',
        params: { uri: track.uri, filename: track.filename, trackId: track.id },
      });
    },
    [router],
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
      // Defensive: pickAndImportFile resolves to an outcome on expected
      // failures, but an unexpected throw must still surface to the user
      // rather than silently doing nothing.
      showToast(`Import failed: ${errorMessage(error)}`, 'error');
    } finally {
      setImporting(false);
    }
  }, [addTrack, showToast]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      {tracks.length === 0 ? (
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
          <View style={styles.header}>
            <Text style={theme.typography.heading}>Library</Text>
            <ImportButton onPress={handleImport} loading={importing} />
          </View>
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TrackListItem
                track={item}
                onPress={handleTrackPress}
                onDelete={handleDelete}
                style={styles.listItem}
              />
            )}
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  listItem: {
    marginBottom: spacing.sm,
  },
});

import { useCallback, useState } from 'react';
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

  useFocusEffect(
    useCallback(() => {
      // Ignore a load that resolves after the screen has blurred: refocusing
      // starts a fresh load, and a slow earlier one landing afterwards would
      // clobber the newer list (and any import made in between) with its
      // stale snapshot.
      let cancelled = false;
      loadTracks()
        .then((loaded) => {
          if (!cancelled) setTracks(loaded);
        })
        .catch(() => {
          if (!cancelled) showToast('Failed to load library', 'error');
        });
      return () => {
        cancelled = true;
      };
    }, [showToast]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const loaded = await loadTracks();
      setTracks(loaded);
      // Announced rather than toasted: the RefreshControl spinner is the
      // sighted user's confirmation, so a banner here would be redundant.
      AccessibilityInfo.announceForAccessibility('Library refreshed');
    } catch {
      showToast('Failed to refresh library', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [showToast]);

  const addTrack = useCallback(
    async (track: Track): Promise<boolean> => {
      try {
        await insertTrack(track);
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
    [showToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteTrack(id);
        setTracks((prev) => prev.filter((t) => t.id !== id));
        showToast('Track deleted', 'success');
      } catch {
        showToast('Failed to delete track', 'error');
      }
    },
    [showToast],
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

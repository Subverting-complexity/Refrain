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
import { Toast } from '@/src/components/Toast';
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

export default function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  useFocusEffect(
    useCallback(() => {
      loadTracks()
        .then(setTracks)
        .catch(() => {
          AccessibilityInfo.announceForAccessibility('Failed to load library');
          showToast('Failed to load library', 'error');
        });
    }, [showToast]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const loaded = await loadTracks();
      setTracks(loaded);
      AccessibilityInfo.announceForAccessibility('Library refreshed');
    } catch {
      AccessibilityInfo.announceForAccessibility('Failed to refresh library');
      showToast('Failed to refresh library', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [showToast]);

  const addTrack = useCallback(
    (track: Track) => {
      try {
        insertTrack(track);
        setTracks((prev) => [track, ...prev]);
      } catch {
        AccessibilityInfo.announceForAccessibility(
          'Failed to save track to library',
        );
        showToast('Failed to save track to library', 'error');
      }
    },
    [showToast],
  );

  const handleDelete = useCallback(
    (id: string) => {
      try {
        deleteTrack(id);
        setTracks((prev) => prev.filter((t) => t.id !== id));
        AccessibilityInfo.announceForAccessibility('Track deleted');
        showToast('Track deleted', 'success');
      } catch {
        AccessibilityInfo.announceForAccessibility('Failed to delete track');
        showToast('Failed to delete track', 'error');
      }
    },
    [showToast],
  );

  const handleShareImport = useCallback(
    (track: Track) => {
      addTrack(track);
      AccessibilityInfo.announceForAccessibility(
        `Received ${track.filename} from share`,
      );
      showToast(`Received ${track.filename} from share`, 'success');
    },
    [addTrack, showToast],
  );

  const handleShareError = useCallback(
    (message: string) => {
      AccessibilityInfo.announceForAccessibility(
        `Share import failed: ${message}`,
      );
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
        addTrack(result.track);
        AccessibilityInfo.announceForAccessibility(
          `Imported ${result.track.filename} successfully`,
        );
        showToast(`Imported ${result.track.filename} successfully`, 'success');
      } else if (result.error !== 'cancelled') {
        AccessibilityInfo.announceForAccessibility(
          `Import failed: ${result.message}`,
        );
        showToast(`Import failed: ${result.message}`, 'error');
      }
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
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? 'success'}
        onDismiss={hideToast}
      />
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

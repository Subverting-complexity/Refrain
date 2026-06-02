import { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImportButton } from '@/src/components/ImportButton';
import { TrackListItem } from '@/src/components/TrackListItem';
import { useShareIntent } from '@/src/hooks/useShareIntent';
import { useTheme } from '@/src/hooks/useTheme';
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

  useFocusEffect(
    useCallback(() => {
      loadTracks().then(setTracks);
    }, []),
  );

  const addTrack = useCallback((track: Track) => {
    try {
      insertTrack(track);
      setTracks((prev) => [track, ...prev]);
    } catch {
      AccessibilityInfo.announceForAccessibility(
        'Failed to save track to library',
      );
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    try {
      deleteTrack(id);
      setTracks((prev) => prev.filter((t) => t.id !== id));
      AccessibilityInfo.announceForAccessibility('Track deleted');
    } catch {
      AccessibilityInfo.announceForAccessibility('Failed to delete track');
    }
  }, []);

  const handleShareImport = useCallback(
    (track: Track) => {
      addTrack(track);
      AccessibilityInfo.announceForAccessibility(
        `Received ${track.filename} from share`,
      );
    },
    [addTrack],
  );

  const handleShareError = useCallback((message: string) => {
    AccessibilityInfo.announceForAccessibility(
      `Share import failed: ${message}`,
    );
  }, []);

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
      } else if (result.error !== 'cancelled') {
        AccessibilityInfo.announceForAccessibility(
          `Import failed: ${result.message}`,
        );
      }
    } finally {
      setImporting(false);
    }
  }, [addTrack]);

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
          />
        </View>
      )}
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

import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { SeekBar } from '@/src/components/SeekBar';
import { TransportControls } from '@/src/components/TransportControls';
import { useAudioPlayer } from '@/src/hooks/useAudioPlayer';
import { useTheme } from '@/src/hooks/useTheme';
import { spacing } from '@/src/theme';

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { uri, filename } = useLocalSearchParams<{
    uri: string;
    filename: string;
  }>();

  const { status, positionMs, durationMs, play, pause, stop, seekTo } =
    useAudioPlayer(uri ?? null);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <View style={styles.artwork}>
        <View
          style={[
            styles.artworkPlaceholder,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Ionicons
            name="musical-notes"
            size={64}
            color={theme.colors.accent}
          />
        </View>
      </View>

      <View style={styles.trackInfo}>
        <Text
          style={[theme.typography.heading, styles.trackName]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {filename ?? 'Unknown track'}
        </Text>
      </View>

      {status === 'error' && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={theme.colors.error} />
          <Text style={[theme.typography.body, { color: theme.colors.error }]}>
            Unable to load this track
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <SeekBar
          positionMs={positionMs}
          durationMs={durationMs}
          onSeek={seekTo}
          style={styles.seekBar}
        />

        <TransportControls
          status={status}
          onPlay={play}
          onPause={pause}
          onStop={stop}
          style={styles.transport}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  artwork: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  artworkPlaceholder: {
    width: 240,
    height: 240,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackInfo: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  trackName: {
    textAlign: 'center',
  },
  controls: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  seekBar: {
    marginBottom: spacing.xl,
  },
  transport: {
    marginBottom: spacing.lg,
  },
});

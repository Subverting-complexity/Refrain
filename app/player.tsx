import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { CountdownOverlay } from '@/src/components/CountdownOverlay';
import { CountdownSettings } from '@/src/components/CountdownSettings';
import { MarkerControls } from '@/src/components/MarkerControls';
import { SeekBar } from '@/src/components/SeekBar';
import { TransportControls } from '@/src/components/TransportControls';
import { WaveformView } from '@/src/components/WaveformView';
import { useAudioPlayer } from '@/src/hooks/useAudioPlayer';
import { useCountdown } from '@/src/hooks/useCountdown';
import { useWaveformData } from '@/src/hooks/useWaveformData';
import { useTheme } from '@/src/hooks/useTheme';
import { spacing } from '@/src/theme';

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { uri, filename } = useLocalSearchParams<{
    uri: string;
    filename: string;
  }>();

  const {
    status,
    positionMs,
    durationMs,
    markerA,
    markerB,
    pause,
    stop,
    seekTo,
    setMarkerA,
    setMarkerB,
    clearMarkers,
  } = useAudioPlayer(uri ?? null);
  const { peaks } = useWaveformData(uri ?? null);
  const {
    countdownState,
    countdownConfig,
    setCountdownConfig,
    playWithCountdown,
    cancelCountdown,
  } = useCountdown();

  const isCounting = countdownState.phase === 'counting';

  const handlePlay = () => {
    if (isCounting) {
      cancelCountdown();
    } else {
      void playWithCountdown();
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <CountdownOverlay countdownState={countdownState} />

      <View style={styles.waveformArea}>
        {peaks.length > 0 ? (
          <WaveformView
            peaks={peaks}
            positionMs={positionMs}
            durationMs={durationMs}
            onSeek={seekTo}
            markerA={markerA ?? undefined}
            markerB={markerB ?? undefined}
            onMarkerAChange={setMarkerA}
            onMarkerBChange={setMarkerB}
          />
        ) : (
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
        )}
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
        <CountdownSettings
          config={countdownConfig}
          onConfigChange={setCountdownConfig}
          style={styles.countdownSettings}
        />

        <MarkerControls
          status={status}
          positionMs={positionMs}
          markerA={markerA}
          markerB={markerB}
          onSetMarkerA={setMarkerA}
          onSetMarkerB={setMarkerB}
          onClearMarkers={clearMarkers}
          style={styles.markers}
        />

        <SeekBar
          positionMs={positionMs}
          durationMs={durationMs}
          onSeek={seekTo}
          style={styles.seekBar}
        />

        <TransportControls
          status={isCounting ? 'playing' : status}
          onPlay={handlePlay}
          onPause={isCounting ? cancelCountdown : pause}
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
  waveformArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
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
  markers: {
    marginBottom: spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  countdownSettings: {
    marginBottom: spacing.lg,
  },
  seekBar: {
    marginBottom: spacing.xl,
  },
  transport: {
    marginBottom: spacing.lg,
  },
});

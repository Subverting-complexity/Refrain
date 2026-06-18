import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AccessiblePressable } from '@/src/components/AccessiblePressable';
import { CountdownOverlay } from '@/src/components/CountdownOverlay';
import { CountdownSettings } from '@/src/components/CountdownSettings';
import { MarkerControls, PlaceMode } from '@/src/components/MarkerControls';
import { SeekBar } from '@/src/components/SeekBar';
import { SegmentProfileSheet } from '@/src/components/SegmentProfileSheet';
import { SkipControls } from '@/src/components/SkipControls';
import { SnippetPreviewSettings } from '@/src/components/SnippetPreviewSettings';
import { Toast } from '@/src/components/Toast';
import { TransportControls } from '@/src/components/TransportControls';
import { VolumeControl } from '@/src/components/VolumeControl';
import { WaveformView } from '@/src/components/WaveformView';
import { useAudioPlayer } from '@/src/hooks/useAudioPlayer';
import { useCountdown } from '@/src/hooks/useCountdown';
import { useSkipInterval } from '@/src/hooks/useSkipInterval';
import { useSnippetPreview } from '@/src/hooks/useSnippetPreview';
import { useToast } from '@/src/hooks/useToast';
import { useWaveformData } from '@/src/hooks/useWaveformData';
import { useTheme } from '@/src/hooks/useTheme';
import { updateTrackDuration } from '@/src/services/trackStore';
import { spacing } from '@/src/theme';
import { SegmentProfile } from '@/src/types';

const MARKER_B_BEFORE_A_MESSAGE = 'Loop end must come after loop start';

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { uri, filename, trackId } = useLocalSearchParams<{
    uri: string;
    filename: string;
    trackId: string;
  }>();

  const {
    status,
    positionMs,
    durationMs,
    markerA,
    markerB,
    loopEnabled,
    lastError,
    volume,
    play,
    pause,
    seekTo,
    skipBy,
    setMarkerA,
    setMarkerB,
    clearMarkers,
    clearMarkerB,
    setLoopEnabled,
    setLoopRestartHandler,
    setVolume,
    startMonitor,
    updateMonitor,
    stopMonitor,
  } = useAudioPlayer(uri ?? null, trackId ?? null);

  const { skipSeconds, skipMs, setSkipSeconds } = useSkipInterval();
  const { snippetPreviewEnabled, setSnippetPreviewEnabled } =
    useSnippetPreview();

  // Rolling-monitor preview wiring for marker drags. Built once and passed to
  // the waveform only while the preference is on, so with it off the monitor is
  // never invoked and dragging behaves exactly as before.
  const handlePreviewStart = useCallback(
    (centerMs: number) => {
      void startMonitor(centerMs);
    },
    [startMonitor],
  );
  const handlePreviewMove = useCallback(
    (centerMs: number) => {
      updateMonitor(centerMs);
    },
    [updateMonitor],
  );
  const handlePreviewEnd = useCallback(() => {
    void stopMonitor();
  }, [stopMonitor]);

  // Tap-to-place arm state. Driven by the A/B buttons; the waveform reads it to
  // decide whether a tap drops a marker or just seeks.
  const [placeMode, setPlaceMode] = useState<PlaceMode>('none');

  // Whether the segment-profile sheet is open. The sheet is mounted only while
  // open so its profile store is read on demand, not on every player render.
  const [profilesVisible, setProfilesVisible] = useState(false);

  // Apply a saved profile to the engine. Set A before B so the A < B invariant
  // holds (saved profiles always carry a valid region), then the loop flag.
  // Each setter auto-persists the active markers (#117).
  const handleLoadProfile = useCallback(
    (profile: SegmentProfile) => {
      if (profile.markerA != null) setMarkerA(profile.markerA);
      if (profile.markerB != null) setMarkerB(profile.markerB);
      setLoopEnabled(profile.loopEnabled);
    },
    [setMarkerA, setMarkerB, setLoopEnabled],
  );

  const durationPersisted = useRef(false);
  useEffect(() => {
    if (trackId && durationMs > 0 && !durationPersisted.current) {
      // Optimistically guard against re-entry; clear the flag on failure so
      // the next durationMs update retries. Handles both a native synchronous
      // throw and a web asynchronous rejection (the web store is async).
      durationPersisted.current = true;
      try {
        void Promise.resolve(updateTrackDuration(trackId, durationMs)).catch(
          () => {
            durationPersisted.current = false;
          },
        );
      } catch {
        durationPersisted.current = false;
      }
    }
  }, [trackId, durationMs]);

  const { toast, showToast, hideToast } = useToast();

  // The B button rejects placements at or before A. Surface that instead of
  // failing silently: announce for screen readers and show a visible toast.
  const handleSetMarkerB = useCallback(
    (positionMs: number) => {
      if (!setMarkerB(positionMs)) {
        AccessibilityInfo.announceForAccessibility(MARKER_B_BEFORE_A_MESSAGE);
        showToast(MARKER_B_BEFORE_A_MESSAGE, 'error');
      }
    },
    [setMarkerB, showToast],
  );

  // Pressing A: with A set, clear both markers; otherwise arm placing A. The
  // first wave tap then drops A and advances the arm to B (see
  // handlePlaceComplete), so one button press sets up the whole A→B sequence.
  const handlePressA = useCallback(() => {
    if (markerA != null) {
      clearMarkers();
      setPlaceMode('none');
    } else {
      setPlaceMode((m) => (m === 'A' ? 'none' : 'A'));
    }
  }, [markerA, clearMarkers]);

  // Pressing B: with B set, clear it and re-arm placing B; otherwise (A exists)
  // arm placing B. A no-op before A is set — the button is disabled then.
  const handlePressB = useCallback(() => {
    if (markerB != null) {
      clearMarkerB();
      setPlaceMode('B');
    } else if (markerA != null) {
      setPlaceMode((m) => (m === 'B' ? 'none' : 'B'));
    }
  }, [markerB, markerA, clearMarkerB]);

  // After the wave drops a marker, advance the arm: A → B (place the end next),
  // B → none (sequence complete).
  const handlePlaceComplete = useCallback((marker: 'A' | 'B') => {
    setPlaceMode(marker === 'A' ? 'B' : 'none');
  }, []);

  const { peaks } = useWaveformData(uri ?? null);
  const {
    countdownState,
    countdownConfig,
    setCountdownConfig,
    playWithCountdown,
    cancelCountdown,
  } = useCountdown({ onPlay: play });

  // When the count-in is set to fire on every loop, register a handler the
  // engine calls each time the loop rewinds to A: it pauses at A, runs the
  // count-in, then resumes. Otherwise leave the loop seamless.
  useEffect(() => {
    if (countdownConfig.enabled && countdownConfig.repeat === 'everyLoop') {
      setLoopRestartHandler(() => {
        void playWithCountdown();
      });
    } else {
      setLoopRestartHandler(null);
    }
    return () => setLoopRestartHandler(null);
  }, [
    countdownConfig.enabled,
    countdownConfig.repeat,
    setLoopRestartHandler,
    playWithCountdown,
  ]);

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
      <CountdownOverlay
        countdownState={countdownState}
        onCancel={cancelCountdown}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.waveformArea}>
          {peaks.length > 0 ? (
            <WaveformView
              peaks={peaks}
              positionMs={positionMs}
              durationMs={durationMs}
              onSeek={seekTo}
              markerA={markerA ?? undefined}
              markerB={markerB ?? undefined}
              loopEnabled={loopEnabled}
              placeMode={placeMode}
              onPlaceComplete={handlePlaceComplete}
              onMarkerAChange={setMarkerA}
              onMarkerBChange={handleSetMarkerB}
              onPreviewStart={
                snippetPreviewEnabled ? handlePreviewStart : undefined
              }
              onPreviewMove={
                snippetPreviewEnabled ? handlePreviewMove : undefined
              }
              onPreviewEnd={
                snippetPreviewEnabled ? handlePreviewEnd : undefined
              }
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
            <View style={styles.errorHeadline}>
              <Ionicons
                name="alert-circle"
                size={20}
                color={theme.colors.error}
              />
              <Text
                style={[theme.typography.body, { color: theme.colors.error }]}
              >
                Unable to load this track
              </Text>
            </View>
            {lastError ? (
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.textSecondary },
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {lastError}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.controls}>
          <CountdownSettings
            config={countdownConfig}
            onConfigChange={setCountdownConfig}
            style={styles.countdownSettings}
          />

          <SnippetPreviewSettings
            enabled={snippetPreviewEnabled}
            onChange={setSnippetPreviewEnabled}
            style={styles.snippetPreview}
          />

          <MarkerControls
            status={status}
            markerA={markerA}
            markerB={markerB}
            loopEnabled={loopEnabled}
            placeMode={placeMode}
            onPressA={handlePressA}
            onPressB={handlePressB}
            onToggleLoop={setLoopEnabled}
            style={styles.markers}
          />

          {trackId ? (
            <AccessiblePressable
              accessibilityRole="button"
              accessibilityLabel="Open segment profiles"
              onPress={() => setProfilesVisible(true)}
              style={(state) => [
                styles.segmentsButton,
                {
                  borderColor: theme.colors.border,
                  opacity: state.pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name="bookmarks-outline"
                size={18}
                color={theme.colors.textPrimary}
              />
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textPrimary },
                ]}
              >
                Segments
              </Text>
            </AccessiblePressable>
          ) : null}

          <SeekBar
            positionMs={positionMs}
            durationMs={durationMs}
            onSeek={seekTo}
            rangeStartMs={markerA ?? undefined}
            rangeEndMs={markerB ?? undefined}
            style={styles.seekBar}
          />

          <VolumeControl
            volume={volume}
            onVolumeChange={setVolume}
            style={styles.volume}
          />

          <SkipControls
            skipSeconds={skipSeconds}
            onSkipSecondsChange={setSkipSeconds}
            style={styles.skip}
          />

          <TransportControls
            status={isCounting ? 'playing' : status}
            onPlay={handlePlay}
            onPause={isCounting ? cancelCountdown : pause}
            onSkipBack={() => skipBy(-skipMs)}
            onSkipForward={() => skipBy(skipMs)}
            style={styles.transport}
          />
        </View>
      </ScrollView>

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onDismiss={hideToast}
      />

      {profilesVisible && trackId ? (
        <SegmentProfileSheet
          trackId={trackId}
          markerA={markerA}
          markerB={markerB}
          loopEnabled={loopEnabled}
          onLoadProfile={handleLoadProfile}
          onClose={() => setProfilesVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  waveformArea: {
    flexGrow: 1,
    minHeight: 200,
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
  segmentsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  errorBanner: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  errorHeadline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  countdownSettings: {
    marginBottom: spacing.lg,
  },
  snippetPreview: {
    marginBottom: spacing.lg,
  },
  seekBar: {
    marginBottom: spacing.lg,
  },
  volume: {
    marginBottom: spacing.lg,
  },
  skip: {
    marginBottom: spacing.xl,
  },
  transport: {
    marginBottom: spacing.lg,
  },
});

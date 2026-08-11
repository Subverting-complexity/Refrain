import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ControlsDrawer } from '@/src/components/ControlsDrawer';
import { CountdownOverlay } from '@/src/components/CountdownOverlay';
import { MarkerControls, PlaceMode } from '@/src/components/MarkerControls';
import { SeekBar } from '@/src/components/SeekBar';
import { SegmentProfileSheet } from '@/src/components/SegmentProfileSheet';
import { SegmentSaveDialog } from '@/src/components/SegmentSaveDialog';
import { ToastHost } from '@/src/components/ToastHost';
import { TransportControls } from '@/src/components/TransportControls';
import { UnsavedSegmentDialog } from '@/src/components/UnsavedSegmentDialog';
import { WaveformView } from '@/src/components/WaveformView';
import { useAudioPlayer } from '@/src/hooks/useAudioPlayer';
import { useCountdown } from '@/src/hooks/useCountdown';
import { usePersistTrackDuration } from '@/src/hooks/usePersistTrackDuration';
import { useSegmentWorkflow } from '@/src/hooks/useSegmentWorkflow';
import { useSkipInterval } from '@/src/hooks/useSkipInterval';
import { useSnippetPreview } from '@/src/hooks/useSnippetPreview';
import { useToast } from '@/src/hooks/useToast';
import { useWaveformData } from '@/src/hooks/useWaveformData';
import { useTheme } from '@/src/hooks/useTheme';
import { radii, spacing } from '@/src/theme';

const MARKER_B_BEFORE_A_MESSAGE = 'Loop end must come after loop start';

// Square placeholder shown while the waveform has no peaks to draw yet.
const ARTWORK_PLACEHOLDER_SIZE = 240;

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  // Scale the waveform to the viewport so it fills the space instead of sitting
  // small and boxed-in — taller on bigger screens, with sane phone bounds.
  const waveformHeight = Math.round(
    Math.min(340, Math.max(180, windowHeight * 0.28)),
  );
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
    stop,
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
  } = useAudioPlayer(uri ?? null, trackId ?? null, filename ?? null);

  const { toast, showToast, hideToast } = useToast();

  // The named-segment side of the player: the saved list, which one is loaded,
  // both dialogs, and the unsaved-edit guard (including the leave-the-screen
  // intercept). The live A/B region stays with the engine above.
  const segments = useSegmentWorkflow({
    trackId: trackId ?? null,
    markerA,
    markerB,
    loopEnabled,
    setMarkerA,
    setMarkerB,
    setLoopEnabled,
    showToast,
  });

  usePersistTrackDuration(trackId ?? null, durationMs);

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

  // Fold the track title into the header: the stack screen's static
  // "Now Playing" title is replaced by the filename so the player body no
  // longer needs a separate centered title band.
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ title: filename ?? 'Now Playing' });
  }, [navigation, filename]);

  // The B button rejects placements at or before A. Surface that instead of
  // failing silently: the toast is both shown and announced (see useToast).
  const handleSetMarkerB = useCallback(
    (positionMs: number) => {
      if (!setMarkerB(positionMs)) {
        showToast(MARKER_B_BEFORE_A_MESSAGE, 'error');
      }
    },
    [setMarkerB, showToast],
  );

  const { clearLoaded } = segments;

  // Pressing A: with A set, clear both markers; otherwise arm placing A. The
  // first wave tap then drops A and advances the arm to B (see
  // handlePlaceComplete), so one button press sets up the whole A→B sequence.
  const handlePressA = useCallback(() => {
    if (markerA != null) {
      clearMarkers();
      // Clearing the region by hand abandons the loaded-segment identity, so
      // the unsaved-edit guard does not fire on an empty region.
      clearLoaded();
      setPlaceMode('none');
    } else {
      setPlaceMode((m) => (m === 'A' ? 'none' : 'A'));
    }
  }, [markerA, clearMarkers, clearLoaded]);

  // Clear button: wipe both markers and drop the loaded-segment identity (so
  // the unsaved-edit guard does not fire on an empty region), then disarm.
  // Mirrors the A-button clear shortcut as an always-visible control.
  const handleClear = useCallback(() => {
    clearMarkers();
    clearLoaded();
    setPlaceMode('none');
  }, [clearMarkers, clearLoaded]);

  // Remove B from the time editor sheet — clears B only without re-arming.
  const handleRemoveB = useCallback(() => {
    clearMarkerB();
    clearLoaded();
  }, [clearMarkerB, clearLoaded]);

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

  // Stop: cancel any pending count-in, then halt playback, rewind, and release
  // the audio session back to other apps. Gives the user an explicit "done"
  // action rather than relying on leaving the screen to stop the track.
  const handleStop = () => {
    if (isCounting) cancelCountdown();
    void stop();
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
              height={waveformHeight}
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
          <MarkerControls
            status={status}
            markerA={markerA}
            markerB={markerB}
            durationMs={durationMs}
            loopEnabled={loopEnabled}
            placeMode={placeMode}
            onPressA={handlePressA}
            onPressB={handlePressB}
            onEditA={setMarkerA}
            onEditB={handleSetMarkerB}
            onRemoveA={handleClear}
            onRemoveB={handleRemoveB}
            onToggleLoop={setLoopEnabled}
            onSave={trackId ? segments.openSave : undefined}
            onClear={handleClear}
            style={styles.markers}
          />

          <SeekBar
            positionMs={positionMs}
            durationMs={durationMs}
            onSeek={seekTo}
            rangeStartMs={markerA ?? undefined}
            rangeEndMs={markerB ?? undefined}
            style={styles.seekBar}
          />

          <View
            style={[styles.footer, { borderTopColor: theme.colors.border }]}
          >
            <ControlsDrawer
              countdownConfig={countdownConfig}
              onCountdownConfigChange={setCountdownConfig}
              volume={volume}
              onVolumeChange={setVolume}
              skipSeconds={skipSeconds}
              onSkipSecondsChange={setSkipSeconds}
              onOpenSegments={
                trackId ? () => setProfilesVisible(true) : undefined
              }
              style={styles.drawer}
            />

            <TransportControls
              status={isCounting ? 'playing' : status}
              onPlay={handlePlay}
              onPause={isCounting ? cancelCountdown : pause}
              onSkipBack={() => skipBy(-skipMs)}
              onSkipForward={() => skipBy(skipMs)}
              onStop={handleStop}
              style={styles.transport}
            />
          </View>
        </View>
      </ScrollView>

      <ToastHost toast={toast} onDismiss={hideToast} />

      {profilesVisible && trackId ? (
        <SegmentProfileSheet
          profiles={segments.profiles}
          onLoadProfile={segments.requestLoad}
          onRename={segments.rename}
          onRemove={segments.remove}
          snippetPreviewEnabled={snippetPreviewEnabled}
          onSnippetPreviewChange={setSnippetPreviewEnabled}
          onClose={() => setProfilesVisible(false)}
        />
      ) : null}

      {segments.saveVisible ? (
        <SegmentSaveDialog
          loadedName={
            segments.isDirty && segments.loadedProfile
              ? segments.loadedProfile.name
              : null
          }
          suggestedName={segments.suggestedName}
          onOverride={segments.saveOverLoaded}
          onSaveNew={segments.saveAsNew}
          onCancel={segments.closeSave}
        />
      ) : null}

      {segments.guardVisible ? (
        <UnsavedSegmentDialog
          profileName={segments.loadedProfile?.name ?? 'this segment'}
          onSave={segments.guardSave}
          onDiscard={segments.guardDiscard}
          onCancel={segments.guardCancel}
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
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  artworkPlaceholder: {
    width: ARTWORK_PLACEHOLDER_SIZE,
    height: ARTWORK_PLACEHOLDER_SIZE,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  markers: {
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
  seekBar: {
    marginBottom: spacing.lg,
  },
  // Footer groups the launcher row with the transport under a divider so the
  // secondary controls read as part of the playback cluster, not a floating
  // mid-screen band.
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
  },
  drawer: {
    marginBottom: spacing.lg,
  },
  transport: {
    marginBottom: spacing.lg,
  },
});

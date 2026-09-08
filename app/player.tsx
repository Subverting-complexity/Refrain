import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ConfirmDestructiveDialog } from '@/src/components/ConfirmDestructiveDialog';
import { ControlsDrawer } from '@/src/components/ControlsDrawer';
import { CountdownOverlay } from '@/src/components/CountdownOverlay';
import { MarkerControls, PlaceMode } from '@/src/components/MarkerControls';
import { PlayerErrorBanner } from '@/src/components/PlayerErrorBanner';
import { SeekBar } from '@/src/components/SeekBar';
import { SegmentProfileSheet } from '@/src/components/SegmentProfileSheet';
import { SegmentRenameDialog } from '@/src/components/SegmentRenameDialog';
import { SegmentSaveDialog } from '@/src/components/SegmentSaveDialog';
import { ToastHost } from '@/src/components/ToastHost';
import { TransportControls } from '@/src/components/TransportControls';
import { UnsavedSegmentDialog } from '@/src/components/UnsavedSegmentDialog';
import { WaveformView } from '@/src/components/WaveformView';
import { useAudioPlayer } from '@/src/hooks/useAudioPlayer';
import { useCountdown } from '@/src/hooks/useCountdown';
import { useMarkerDrag } from '@/src/hooks/useMarkerDrag';
import { usePersistTrackDuration } from '@/src/hooks/usePersistTrackDuration';
import { useStampTrackPlayed } from '@/src/hooks/useStampTrackPlayed';
import { useSegmentWorkflow } from '@/src/hooks/useSegmentWorkflow';
import { useSkipInterval } from '@/src/hooks/useSkipInterval';
import { useSnippetPreview } from '@/src/hooks/useSnippetPreview';
import { useToast } from '@/src/hooks/useToast';
import { useTrackSource } from '@/src/hooks/useTrackSource';
import { useWaveformData } from '@/src/hooks/useWaveformData';
import { useTheme } from '@/src/hooks/useTheme';
import { radii, spacing } from '@/src/theme';

const MARKER_B_BEFORE_A_MESSAGE = 'Loop end must come after loop start';

// Square placeholder shown while the waveform has no peaks to draw yet.
const ARTWORK_PLACEHOLDER_SIZE = 240;

export default function PlayerScreen() {
  const { theme } = useTheme();
  const {
    uri: rawUri,
    filename: rawFilename,
    trackId: rawTrackId,
  } = useLocalSearchParams<{
    uri: string;
    filename: string;
    trackId: string;
  }>();

  // Normalise the params once, up front. An absent param arrives as undefined
  // but a present-and-empty one arrives as `''`, and an empty value is just as
  // absent as a missing one — so `|| null` rather than `?? null`, applied here
  // so every consumer below sees the same shape.
  const trackId = rawTrackId || null;
  const paramUri = rawUri || null;
  const paramFilename = rawFilename || null;

  // Re-read the playable uri from the store rather than trusting the one in the
  // route. A uri captured at navigation time goes stale — on web it is a
  // `blob:` URL that dies with the document, so a reload, a restored history
  // entry, or a shared link left the player with a dead source. See
  // `useTrackSource`.
  const {
    uri,
    filename,
    isResolving: isResolvingSource,
    isMissing: isTrackMissing,
  } = useTrackSource(trackId, paramUri, paramFilename);

  const {
    status,
    playheadMs,
    durationMs,
    markerA,
    markerB,
    loopEnabled,
    lastError,
    volume,
    play,
    pause,
    seekTo,
    skipBack,
    skipForward,
    setMarkerA,
    setMarkerB,
    clearMarkers,
    clearMarkerB,
    commitMarkerPlacement,
    setLoopEnabled,
    setLoopRestartHandler,
    setVolume,
    startMonitor,
    updateMonitor,
    stopMonitor,
  } = useAudioPlayer(uri, trackId, filename);

  const { toast, showToast, showError, hideToast } = useToast();

  // Where the waveform publishes the marker it is dragging. Owned here because
  // the wave and the marker tiles both draw from it and are siblings; the
  // engine hears about a marker only when the gesture starts and settles, so
  // this is the only live account of one between those two points. See
  // `useMarkerDrag`.
  const markerDrag = useMarkerDrag();

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
    commitMarkerPlacement,
    showToast,
  });

  usePersistTrackDuration(trackId ?? null, durationMs);
  useStampTrackPlayed(trackId ?? null, status);

  const { skipPreference, setSkipPreference, skipBackLabel, skipForwardLabel } =
    useSkipInterval();
  const { snippetPreviewEnabled, setSnippetPreviewEnabled } =
    useSnippetPreview();

  // Rolling-monitor preview wiring for marker drags. Built once and passed to
  // the waveform only while the preference is on, so with it off the monitor is
  // never invoked and dragging behaves exactly as before.
  const handlePreviewStart = useCallback(
    (centerMs: number) => {
      // Rejects when the player is released mid-drag (navigating away). The
      // preview is a courtesy; a failed one must not raise an unhandled
      // rejection out of a gesture handler.
      void startMonitor(centerMs).catch(() => undefined);
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
    void stopMonitor().catch(() => undefined);
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
    navigation.setOptions({ title: filename || 'Now Playing' });
  }, [navigation, filename]);

  // The B button rejects placements at or before A. Surface that instead of
  // failing silently: the toast is both shown and announced (see useToast).
  // Returns whether the placement landed, so callers that follow it with a
  // commit don't move the playhead for a placement that never happened.
  const applyMarkerB = useCallback(
    (positionMs: number): boolean => {
      if (!setMarkerB(positionMs)) {
        showError(MARKER_B_BEFORE_A_MESSAGE);
        return false;
      }
      return true;
    },
    [setMarkerB, showError],
  );

  const { clearLoaded } = segments;

  // Drag/tap path: fires throughout the gesture, so it never commits — the
  // waveform reports the commit once on release.
  const handleSetMarkerB = useCallback(
    (positionMs: number) => {
      applyMarkerB(positionMs);
    },
    [applyMarkerB],
  );

  // A drag or tap on the wave has settled. Park the playhead at the loop start
  // so the region just defined is the one that plays next.
  const handleMarkerCommit = useCallback(
    (marker: 'A' | 'B') => {
      // The commit ends in a seek, which rejects against a player released
      // mid-gesture. The marker is placed either way; only the courtesy seek
      // is lost, so swallow rather than leave the rejection unhandled.
      void commitMarkerPlacement(marker).catch(() => undefined);
    },
    [commitMarkerPlacement],
  );

  // Typing a time into the marker sheet is just another way to place a marker,
  // so it parks the playhead exactly as a wave gesture does.
  const handleEditA = useCallback(
    (positionMs: number) => {
      setMarkerA(positionMs);
      void commitMarkerPlacement('A').catch(() => undefined);
    },
    [setMarkerA, commitMarkerPlacement],
  );

  const handleEditB = useCallback(
    (positionMs: number) => {
      if (applyMarkerB(positionMs)) {
        void commitMarkerPlacement('B').catch(() => undefined);
      }
    },
    [applyMarkerB, commitMarkerPlacement],
  );

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

  const { peaks, isLoading: isWaveformLoading } = useWaveformData(uri);
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
  // Something is still being worked out — the store lookup for the track, or
  // the peak analysis — as opposed to having finished with nothing to show.
  const waveformPending = isResolvingSource || isWaveformLoading;

  // Every handler the memoised controls receive has to be stable, or a playback
  // tick hands one of them a fresh prop and undoes its memoisation. The two
  // ternaries below need no wrapping — they select between references that are
  // already stable — but an inline arrow would.
  const handlePlay = useCallback(() => {
    if (isCounting) {
      cancelCountdown();
    } else {
      void playWithCountdown();
    }
  }, [isCounting, cancelCountdown, playWithCountdown]);

  const handleOpenSegments = useCallback(() => setProfilesVisible(true), []);
  const handleSave = trackId ? segments.openSave : undefined;
  const handlePause = isCounting ? cancelCountdown : pause;

  // The segment rename and delete dialogs. The sheet decides where to mount
  // this — inside its own Modal or beside it — because the answer differs by
  // platform; see SegmentProfileSheet. The workflow hook keeps the two
  // mutually exclusive, so this is never more than one dialog.
  const segmentDialog = segments.renamingProfile ? (
    <SegmentRenameDialog
      currentName={segments.renamingProfile.name}
      onSave={segments.confirmRename}
      onCancel={segments.cancelRename}
    />
  ) : segments.deletingProfile ? (
    <ConfirmDestructiveDialog
      title="Delete segment?"
      message={`Remove “${segments.deletingProfile.name}” from this track?`}
      confirmLabel="Delete"
      confirmAccessibilityLabel={`Confirm delete ${segments.deletingProfile.name}`}
      cancelAccessibilityLabel="Cancel delete"
      onConfirm={segments.confirmDelete}
      onDismiss={segments.cancelDelete}
    />
  ) : null;

  // Closing the sheet drops any dialog pending over it, so reopening the sheet
  // does not bring back a dialog the user had moved on from.
  const { cancelRename, cancelDelete } = segments;
  const closeProfiles = useCallback(() => {
    setProfilesVisible(false);
    cancelRename();
    cancelDelete();
  }, [cancelRename, cancelDelete]);

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
              playheadMs={playheadMs}
              durationMs={durationMs}
              onSeek={seekTo}
              markerA={markerA ?? undefined}
              markerB={markerB ?? undefined}
              markerDrag={markerDrag}
              loopEnabled={loopEnabled}
              placeMode={placeMode}
              onPlaceComplete={handlePlaceComplete}
              onMarkerCommit={handleMarkerCommit}
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
              accessibilityRole="image"
              accessibilityLabel={
                waveformPending ? 'Loading waveform' : 'No waveform available'
              }
            >
              {/* Distinguish "still analysing the audio" from "no waveform for
                  this file". The two used to render the same static icon, so a
                  slow analysis was indistinguishable from a failed one. */}
              {waveformPending ? (
                <ActivityIndicator
                  size="large"
                  color={theme.colors.accentForeground}
                />
              ) : (
                <Ionicons
                  name="musical-notes"
                  size={64}
                  color={theme.colors.accentForeground}
                />
              )}
            </View>
          )}
        </View>

        {isTrackMissing && (
          <PlayerErrorBanner
            message="This track is no longer in your library"
            detail="Go back and import it again to keep playing."
          />
        )}

        {!isTrackMissing && status === 'error' && (
          <PlayerErrorBanner
            message="Unable to load this track"
            detail={lastError}
            detailNumberOfLines={2}
          />
        )}

        <View style={styles.controls}>
          <MarkerControls
            status={status}
            markerA={markerA}
            markerB={markerB}
            markerDrag={markerDrag}
            durationMs={durationMs}
            loopEnabled={loopEnabled}
            placeMode={placeMode}
            onPressA={handlePressA}
            onPressB={handlePressB}
            onEditA={handleEditA}
            onEditB={handleEditB}
            onRemoveA={handleClear}
            onRemoveB={handleRemoveB}
            onToggleLoop={setLoopEnabled}
            onSave={handleSave}
            onClear={handleClear}
            style={styles.markers}
          />

          <SeekBar
            playheadMs={playheadMs}
            durationMs={durationMs}
            onSeek={seekTo}
            rangeStartMs={markerA ?? undefined}
            rangeEndMs={markerB ?? undefined}
            style={styles.seekBar}
          />

          <View style={[styles.footer, { borderTopColor: theme.colors.track }]}>
            <ControlsDrawer
              countdownConfig={countdownConfig}
              onCountdownConfigChange={setCountdownConfig}
              volume={volume}
              onVolumeChange={setVolume}
              skipPreference={skipPreference}
              onSkipPreferenceChange={setSkipPreference}
              onOpenSegments={trackId ? handleOpenSegments : undefined}
              style={styles.drawer}
            />

            <TransportControls
              status={isCounting ? 'playing' : status}
              onPlay={handlePlay}
              onPause={handlePause}
              onSkipBack={skipBack}
              onSkipForward={skipForward}
              skipBackLabel={skipBackLabel}
              skipForwardLabel={skipForwardLabel}
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
          onRequestRename={segments.requestRename}
          onRequestDelete={segments.requestDelete}
          dialog={segmentDialog}
          snippetPreviewEnabled={snippetPreviewEnabled}
          onSnippetPreviewChange={setSnippetPreviewEnabled}
          onClose={closeProfiles}
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

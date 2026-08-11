import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useLatestRef } from '@/src/hooks/useLatestRef';
import { useSegmentEditor } from '@/src/hooks/useSegmentEditor';
import { useSegmentProfiles } from '@/src/hooks/useSegmentProfiles';
import { useSkipInterval } from '@/src/hooks/useSkipInterval';
import { useSnippetPreview } from '@/src/hooks/useSnippetPreview';
import { useToast } from '@/src/hooks/useToast';
import { useWaveformData } from '@/src/hooks/useWaveformData';
import { useTheme } from '@/src/hooks/useTheme';
import { updateTrackDuration } from '@/src/services/trackStore';
import { radii, spacing } from '@/src/theme';
import { SegmentProfile } from '@/src/types';
import { nextSegmentName } from '@/src/utils/nextSegmentName';
import { settle } from '@/src/utils/settle';

const MARKER_B_BEFORE_A_MESSAGE = 'Loop end must come after loop start';

// Square placeholder shown while the waveform has no peaks to draw yet.
const ARTWORK_PLACEHOLDER_SIZE = 240;

/** A pending action blocked by unsaved segment edits. */
type SegmentGuard =
  | { kind: 'load'; profile: SegmentProfile }
  | { kind: 'leave'; proceed: () => void };

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
    commitMarkerPlacement,
    setLoopEnabled,
    setLoopRestartHandler,
    setVolume,
    startMonitor,
    updateMonitor,
    stopMonitor,
  } = useAudioPlayer(uri ?? null, trackId ?? null, filename ?? null);

  // Named-segment list + CRUD for this track, owned here so the player can show
  // the loaded segment's name and suggest the next one. The sheet receives the
  // list and the rename/remove actions as props.
  const { profiles, save, update, rename, remove } = useSegmentProfiles(
    trackId ?? null,
  );
  // Tracks which segment is loaded and whether its A/B region has been edited.
  const { loadedId, isDirty, markLoaded, clearLoaded } = useSegmentEditor(
    markerA,
    markerB,
  );
  const loadedProfile = loadedId
    ? (profiles.find((p) => p.id === loadedId) ?? null)
    : null;

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
  // Whether the player's Save dialog is open.
  const [saveVisible, setSaveVisible] = useState(false);
  // A load/leave action deferred behind the unsaved-edit guard, or null.
  const [guard, setGuard] = useState<SegmentGuard | null>(null);

  // Arm a saved profile on the engine: set A before B so the A < B invariant
  // holds (saved profiles always carry a valid region), then the loop flag, and
  // adopt it as the loaded segment. Each setter auto-persists the markers (#117).
  const applyProfile = useCallback(
    (profile: SegmentProfile) => {
      if (profile.markerA != null) setMarkerA(profile.markerA);
      if (profile.markerB != null) setMarkerB(profile.markerB);
      setLoopEnabled(profile.loopEnabled);
      markLoaded(profile);
      // Park at the segment's start, but only once both markers have landed —
      // committing per-marker would seek twice for a single load.
      if (profile.markerA != null) void commitMarkerPlacement('A');
    },
    [setMarkerA, setMarkerB, setLoopEnabled, markLoaded, commitMarkerPlacement],
  );

  // Loading from the sheet. If the loaded segment has unsaved marker edits,
  // defer the load behind the guard; otherwise arm the new segment straight away.
  const handleRequestLoad = useCallback(
    (profile: SegmentProfile) => {
      if (isDirty && loadedId) {
        setGuard({ kind: 'load', profile });
      } else {
        applyProfile(profile);
      }
    },
    [isDirty, loadedId, applyProfile],
  );

  const durationPersisted = useRef(false);
  // Reset the persist guard when the track changes so a reused component
  // instance persists the new track's measured duration instead of dropping
  // it. Declared before the persist effect so, on a trackId change, the reset
  // runs first and the new track persists in the same commit (#168).
  useEffect(() => {
    durationPersisted.current = false;
  }, [trackId]);
  useEffect(() => {
    if (trackId && durationMs > 0 && !durationPersisted.current) {
      // Optimistically guard against re-entry; clear the flag on failure so
      // the next durationMs update retries. `settle` covers both a native
      // synchronous throw and a web asynchronous rejection (the web store is
      // async), so the retry reset lives in one place.
      durationPersisted.current = true;
      void settle(() => updateTrackDuration(trackId, durationMs)).catch(() => {
        durationPersisted.current = false;
      });
    }
  }, [trackId, durationMs]);

  const { toast, showToast, hideToast } = useToast();

  // Save dialog: overwrite the loaded segment with the live region, keeping it
  // the loaded segment (snapshot moves to the current markers, so it is clean).
  const handleOverride = useCallback(() => {
    if (loadedId) {
      update(loadedId, { markerA, markerB, loopEnabled });
      markLoaded({ id: loadedId, markerA, markerB });
    }
    setSaveVisible(false);
    showToast('Segment updated');
  }, [loadedId, update, markerA, markerB, loopEnabled, markLoaded, showToast]);

  // Save dialog: create a new segment, then adopt it as the loaded one. The
  // success toast waits for the write to resolve with a stored profile; a
  // falsy result or a rejection reports an error instead of falsely claiming
  // success, and the rejection is caught so none escapes unhandled.
  const handleSaveNew = useCallback(
    (name: string) => {
      setSaveVisible(false);
      void save({ name, markerA, markerB, loopEnabled })
        .then((profile) => {
          if (profile) {
            markLoaded(profile);
            showToast('Segment saved');
          } else {
            showToast('Could not save segment', 'error');
          }
        })
        .catch(() => {
          showToast('Could not save segment', 'error');
        });
    },
    [save, markerA, markerB, loopEnabled, markLoaded, showToast],
  );

  // Carry out a guarded action once the user resolves the unsaved-edit prompt.
  const proceedGuard = useCallback(
    (pending: SegmentGuard) => {
      if (pending.kind === 'load') applyProfile(pending.profile);
      else pending.proceed();
    },
    [applyProfile],
  );

  // Guard "Save": overwrite the loaded segment, then carry on. Advancing the
  // dirty baseline via markLoaded (as handleOverride does) is what keeps the
  // segment from re-reporting as dirty against its now-stale snapshot.
  const handleGuardSave = useCallback(() => {
    if (loadedId) {
      update(loadedId, { markerA, markerB, loopEnabled });
      markLoaded({ id: loadedId, markerA, markerB });
    }
    if (guard) proceedGuard(guard);
    setGuard(null);
  }, [
    loadedId,
    update,
    markerA,
    markerB,
    loopEnabled,
    markLoaded,
    guard,
    proceedGuard,
  ]);

  // Guard "Discard": carry on without saving the named segment. Live per-track
  // markers persist as today (#117); a load overwrites them as usual.
  const handleGuardDiscard = useCallback(() => {
    if (guard) proceedGuard(guard);
    setGuard(null);
  }, [guard, proceedGuard]);

  const handleGuardCancel = useCallback(() => setGuard(null), []);

  // Refs let the navigation listener read the latest dirty/loaded state without
  // re-subscribing every render; the bypass flag lets a resolved guard navigate
  // through without re-triggering itself.
  const dirtyRef = useLatestRef(isDirty);
  const loadedIdRef = useLatestRef(loadedId);
  const bypassGuardRef = useRef(false);

  // Leaving the player with unsaved segment edits: intercept the back action
  // and raise the same guard. Fires for in-app Stack back navigation.
  const navigation = useNavigation();

  // Fold the track title into the header: the stack screen's static
  // "Now Playing" title is replaced by the filename so the player body no
  // longer needs a separate centered title band.
  useEffect(() => {
    navigation.setOptions({ title: filename ?? 'Now Playing' });
  }, [navigation, filename]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (bypassGuardRef.current) return;
      if (!dirtyRef.current || !loadedIdRef.current) return;
      event.preventDefault();
      setGuard({
        kind: 'leave',
        proceed: () => {
          bypassGuardRef.current = true;
          navigation.dispatch(event.data.action);
          bypassGuardRef.current = false;
        },
      });
    });
    return unsubscribe;
    // The refs are stable across renders, so listing them keeps the listener
    // subscribed exactly once — as it was when they were inline `useRef`s.
  }, [navigation, dirtyRef, loadedIdRef]);

  // The B button rejects placements at or before A. Surface that instead of
  // failing silently: the toast is both shown and announced (see useToast).
  // Returns whether the placement landed, so callers that follow it with a
  // commit don't move the playhead for a placement that never happened.
  const applyMarkerB = useCallback(
    (positionMs: number): boolean => {
      if (!setMarkerB(positionMs)) {
        showToast(MARKER_B_BEFORE_A_MESSAGE, 'error');
        return false;
      }
      return true;
    },
    [setMarkerB, showToast],
  );

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
      void commitMarkerPlacement(marker);
    },
    [commitMarkerPlacement],
  );

  // Typing a time into the marker sheet is just another way to place a marker,
  // so it parks the playhead exactly as a wave gesture does.
  const handleEditA = useCallback(
    (positionMs: number) => {
      setMarkerA(positionMs);
      void commitMarkerPlacement('A');
    },
    [setMarkerA, commitMarkerPlacement],
  );

  const handleEditB = useCallback(
    (positionMs: number) => {
      if (applyMarkerB(positionMs)) void commitMarkerPlacement('B');
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
            onEditA={handleEditA}
            onEditB={handleEditB}
            onRemoveA={handleClear}
            onRemoveB={handleRemoveB}
            onToggleLoop={setLoopEnabled}
            onSave={trackId ? () => setSaveVisible(true) : undefined}
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
          profiles={profiles}
          onLoadProfile={handleRequestLoad}
          onRename={rename}
          onRemove={remove}
          snippetPreviewEnabled={snippetPreviewEnabled}
          onSnippetPreviewChange={setSnippetPreviewEnabled}
          onClose={() => setProfilesVisible(false)}
        />
      ) : null}

      {saveVisible ? (
        <SegmentSaveDialog
          loadedName={isDirty && loadedProfile ? loadedProfile.name : null}
          suggestedName={nextSegmentName(profiles)}
          onOverride={handleOverride}
          onSaveNew={handleSaveNew}
          onCancel={() => setSaveVisible(false)}
        />
      ) : null}

      {guard ? (
        <UnsavedSegmentDialog
          profileName={loadedProfile?.name ?? 'this segment'}
          onSave={handleGuardSave}
          onDiscard={handleGuardDiscard}
          onCancel={handleGuardCancel}
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

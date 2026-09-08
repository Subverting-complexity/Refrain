import { useCallback, useEffect } from 'react';
import { SharedValue } from 'react-native-reanimated';

import * as audioEngine from '../services/audioEngine';
import { PlaybackState, PlaybackStatus } from '../types';
import { useEngineSelector } from './useEngineSelector';
import { usePlayheadValue } from './usePlayheadValue';

/**
 * Everything the engine publishes **except** the playhead.
 *
 * The split is the point. `PlaybackState` puts the position in the same object
 * as the transport, so a screen that subscribed to it re-rendered ten times a
 * second while playing and at the drag's cadence while scrubbing — for a
 * button that had not changed. Every field here moves at human speed: a track
 * loads, a marker is dropped, the loop is armed. The position moves at the
 * engine's, and reaches the UI as a shared value instead.
 */
export interface TransportState {
  status: PlaybackStatus;
  durationMs: number;
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
  volume: number;
  lastError?: string;
}

const IDLE_TRANSPORT: TransportState = {
  status: 'idle',
  durationMs: 0,
  markerA: null,
  markerB: null,
  loopEnabled: true,
  volume: 1,
};

function selectTransport(state: PlaybackState): TransportState {
  return {
    status: state.status,
    durationMs: state.durationMs,
    markerA: state.markerA,
    markerB: state.markerB,
    loopEnabled: state.loopEnabled,
    volume: state.volume,
    lastError: state.lastError,
  };
}

function sameTransport(a: TransportState, b: TransportState): boolean {
  return (
    a.status === b.status &&
    a.durationMs === b.durationMs &&
    a.markerA === b.markerA &&
    a.markerB === b.markerB &&
    a.loopEnabled === b.loopEnabled &&
    a.volume === b.volume &&
    a.lastError === b.lastError
  );
}

export interface UseAudioPlayer extends TransportState {
  /**
   * The playhead, in milliseconds, as a shared value.
   *
   * Not React state: it moves ten times a second while playing and follows a
   * finger while scrubbing, and every one of those movements would otherwise
   * be a render. Hand it to a component that draws the playhead — the waveform,
   * the seek bar — which reads it from the UI thread. See
   * {@link usePlayheadValue}.
   */
  playheadMs: SharedValue<number>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seekTo: (ms: number) => Promise<void>;
  skipBack: () => Promise<void>;
  skipForward: () => Promise<void>;
  setMarkerA: (ms: number) => void;
  setMarkerB: (ms: number) => boolean;
  clearMarkers: () => void;
  clearMarkerB: () => void;
  commitMarkerPlacement: (placed: audioEngine.MarkerCommit) => Promise<void>;
  setLoopEnabled: (enabled: boolean) => void;
  setLoopRestartHandler: (handler: (() => void) | null) => void;
  setVolume: (v: number) => void;
  startMonitor: (centerMs: number) => Promise<void>;
  updateMonitor: (centerMs: number) => void;
  stopMonitor: () => Promise<void>;
  /** The engine's current snapshot, for event-time reads that must not subscribe. */
  getPlaybackState: () => PlaybackState;
}

export function useAudioPlayer(
  trackUri: string | null,
  trackId?: string | null,
  trackName?: string | null,
): UseAudioPlayer {
  const transport = useEngineSelector(
    audioEngine.subscribe,
    audioEngine.getState,
    selectTransport,
    sameTransport,
  );
  const playheadMs = usePlayheadValue(
    audioEngine.subscribe,
    audioEngine.getState,
  );

  // Hydrate the persisted volume once on mount, before the track loads, so
  // playback starts at the user's saved level rather than the default. The
  // loader awaits settings hydration internally (web cold-load race, #163),
  // so fire-and-forget here; it notifies subscribers once the value resolves.
  useEffect(() => {
    void audioEngine.loadPersistedVolume();
  }, []);

  useEffect(() => {
    if (!trackUri) return;
    // loadTrack handles its own errors internally and reports them via the
    // 'error' status; the .catch() is defence-in-depth so a rejection here
    // can never become an unhandled promise rejection.
    void audioEngine
      .loadTrack(trackUri, trackId ?? undefined, trackName ?? undefined)
      .catch(() => undefined);
    return () => {
      void audioEngine.unloadTrack().catch(() => undefined);
    };
  }, [trackUri, trackId, trackName]);

  const play = useCallback(() => audioEngine.play(), []);
  const pause = useCallback(() => audioEngine.pause(), []);
  const seekTo = useCallback((ms: number) => audioEngine.seekTo(ms), []);
  // Semantic skips: the engine reads the persisted skip preference itself, so
  // these take no delta and stay in step with the lock-screen controls.
  const skipBack = useCallback(() => audioEngine.skipBack(), []);
  const skipForward = useCallback(() => audioEngine.skipForward(), []);
  const setMarkerA = useCallback(
    (ms: number) => audioEngine.setMarkerA(ms),
    [],
  );
  const setMarkerB = useCallback(
    (ms: number): boolean => audioEngine.setMarkerB(ms),
    [],
  );
  const clearMarkers = useCallback(() => audioEngine.clearMarkers(), []);
  const clearMarkerB = useCallback(() => audioEngine.clearMarkerB(), []);
  const commitMarkerPlacement = useCallback(
    (placed: audioEngine.MarkerCommit) =>
      audioEngine.commitMarkerPlacement(placed),
    [],
  );
  const setLoopEnabled = useCallback(
    (enabled: boolean) => audioEngine.setLoopEnabled(enabled),
    [],
  );
  const setLoopRestartHandler = useCallback(
    (handler: (() => void) | null) =>
      audioEngine.setLoopRestartHandler(handler),
    [],
  );
  const setVolume = useCallback((v: number) => audioEngine.setVolume(v), []);
  const startMonitor = useCallback(
    (centerMs: number) => audioEngine.startMonitor(centerMs),
    [],
  );
  const updateMonitor = useCallback(
    (centerMs: number) => audioEngine.updateMonitor(centerMs),
    [],
  );
  const stopMonitor = useCallback(() => audioEngine.stopMonitor(), []);

  return {
    ...transport,
    playheadMs,
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
    getPlaybackState: audioEngine.getState,
  };
}

export { IDLE_TRANSPORT };

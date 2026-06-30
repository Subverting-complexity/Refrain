import { useCallback, useEffect } from 'react';

import * as audioEngine from '../services/audioEngine';
import { PlaybackState } from '../types';
import { useEngineSubscription } from './useEngineSubscription';

const IDLE_STATE: PlaybackState = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  markerA: null,
  markerB: null,
  loopEnabled: true,
  volume: 1,
};

export function useAudioPlayer(
  trackUri: string | null,
  trackId?: string | null,
  trackName?: string | null,
) {
  const state = useEngineSubscription(audioEngine.subscribe, IDLE_STATE);

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
  const stop = useCallback(() => audioEngine.stop(), []);
  const seekTo = useCallback((ms: number) => audioEngine.seekTo(ms), []);
  const skipBy = useCallback(
    (deltaMs: number) => audioEngine.skipBy(deltaMs),
    [],
  );
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
    ...state,
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
  };
}

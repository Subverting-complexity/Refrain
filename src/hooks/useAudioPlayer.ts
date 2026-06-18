import { useCallback, useEffect, useState } from 'react';

import * as audioEngine from '../services/audioEngine';
import { PlaybackState } from '../types';

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
) {
  const [state, setState] = useState<PlaybackState>(IDLE_STATE);

  useEffect(() => {
    const unsubscribe = audioEngine.subscribe(setState);
    return unsubscribe;
  }, []);

  // Hydrate the persisted volume once on mount, before the track loads, so
  // playback starts at the user's saved level rather than the default.
  useEffect(() => {
    audioEngine.loadPersistedVolume();
  }, []);

  useEffect(() => {
    if (!trackUri) return;
    // loadTrack handles its own errors internally and reports them via the
    // 'error' status; the .catch() is defence-in-depth so a rejection here
    // can never become an unhandled promise rejection.
    void audioEngine
      .loadTrack(trackUri, trackId ?? undefined)
      .catch(() => undefined);
    return () => {
      void audioEngine.unloadTrack().catch(() => undefined);
    };
  }, [trackUri, trackId]);

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
  };
}

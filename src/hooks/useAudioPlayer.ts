import { useCallback, useEffect, useState } from 'react';

import * as audioEngine from '../services/audioEngine';
import { PlaybackState } from '../types';

const IDLE_STATE: PlaybackState = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  markerA: null,
  markerB: null,
  volume: 1,
};

export function useAudioPlayer(trackUri: string | null) {
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
    void audioEngine.loadTrack(trackUri).catch(() => undefined);
    return () => {
      void audioEngine.unloadTrack().catch(() => undefined);
    };
  }, [trackUri]);

  const play = useCallback(() => audioEngine.play(), []);
  const pause = useCallback(() => audioEngine.pause(), []);
  const stop = useCallback(() => audioEngine.stop(), []);
  const seekTo = useCallback((ms: number) => audioEngine.seekTo(ms), []);
  const setMarkerA = useCallback(
    (ms: number) => audioEngine.setMarkerA(ms),
    [],
  );
  const setMarkerB = useCallback(
    (ms: number) => audioEngine.setMarkerB(ms),
    [],
  );
  const clearMarkers = useCallback(() => audioEngine.clearMarkers(), []);
  const setVolume = useCallback((v: number) => audioEngine.setVolume(v), []);

  return {
    ...state,
    play,
    pause,
    stop,
    seekTo,
    setMarkerA,
    setMarkerB,
    clearMarkers,
    setVolume,
  };
}

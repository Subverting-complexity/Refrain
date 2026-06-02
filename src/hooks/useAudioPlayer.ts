import { useCallback, useEffect, useState } from 'react';

import * as audioEngine from '../services/audioEngine';
import { PlaybackState } from '../types';

const IDLE_STATE: PlaybackState = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  markerA: null,
  markerB: null,
};

export function useAudioPlayer(trackUri: string | null) {
  const [state, setState] = useState<PlaybackState>(IDLE_STATE);

  useEffect(() => {
    const unsubscribe = audioEngine.subscribe(setState);
    return unsubscribe;
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

  return {
    ...state,
    play,
    pause,
    stop,
    seekTo,
    setMarkerA,
    setMarkerB,
    clearMarkers,
  };
}

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
    audioEngine.loadTrack(trackUri);
    return () => {
      audioEngine.unloadTrack();
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

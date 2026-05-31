import { useCallback, useEffect, useRef, useState } from 'react';

import * as audioEngine from '../services/audioEngine';
import { PlaybackState } from '../types';

const IDLE_STATE: PlaybackState = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
};

export function useAudioPlayer(trackUri: string | null) {
  const [state, setState] = useState<PlaybackState>(IDLE_STATE);
  const uriRef = useRef(trackUri);

  useEffect(() => {
    uriRef.current = trackUri;
  }, [trackUri]);

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

  return { ...state, play, pause, stop, seekTo };
}

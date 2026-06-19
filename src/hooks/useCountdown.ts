import { useCallback, useEffect, useRef, useState } from 'react';

import * as countdownEngine from '../services/countdownEngine';
import { CountdownConfig, CountdownState } from '../types';

const DEFAULT_CONFIG: CountdownConfig = {
  enabled: false,
  mode: 'silent',
  duration: { type: 'seconds', seconds: 3 },
  repeat: 'once',
};

const IDLE_STATE: CountdownState = {
  phase: 'idle',
  beatsRemaining: 0,
  totalBeats: 0,
  currentBeat: 0,
  displayValue: 0,
};

interface UseCountdownOptions {
  onPlay: () => void | Promise<void>;
}

export function useCountdown({ onPlay }: UseCountdownOptions) {
  const [countdownState, setCountdownState] =
    useState<CountdownState>(IDLE_STATE);
  const [config, setConfig] = useState<CountdownConfig>(DEFAULT_CONFIG);
  const configRef = useRef(config);
  configRef.current = config;
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;

  useEffect(() => {
    const unsub = countdownEngine.subscribe(setCountdownState);
    return unsub;
  }, []);

  // Warm up the click asset as soon as the metronome is armed so the first beat
  // of the count-in plays without the initial decode delay.
  useEffect(() => {
    if (config.enabled && config.mode === 'metronome') {
      void countdownEngine.preload();
    }
  }, [config.enabled, config.mode]);

  useEffect(() => {
    return () => {
      countdownEngine.cancel();
    };
  }, []);

  const playWithCountdown = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg.enabled) {
      await onPlayRef.current();
      return;
    }

    await countdownEngine.start(cfg, () => {
      void onPlayRef.current();
    });
  }, []);

  const cancelCountdown = useCallback(() => {
    countdownEngine.cancel();
  }, []);

  return {
    countdownState,
    countdownConfig: config,
    setCountdownConfig: setConfig,
    playWithCountdown,
    cancelCountdown,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';

import * as audioEngine from '../services/audioEngine';
import * as countdownEngine from '../services/countdownEngine';
import { CountdownConfig, CountdownState } from '../types';

const DEFAULT_CONFIG: CountdownConfig = {
  enabled: false,
  mode: 'silent',
  duration: { type: 'bars', bars: 1 },
  bpm: 120,
};

const IDLE_STATE: CountdownState = {
  phase: 'idle',
  beatsRemaining: 0,
  totalBeats: 0,
  currentBeat: 0,
};

export function useCountdown() {
  const [countdownState, setCountdownState] =
    useState<CountdownState>(IDLE_STATE);
  const [config, setConfig] = useState<CountdownConfig>(DEFAULT_CONFIG);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const unsub = countdownEngine.subscribe(setCountdownState);
    return unsub;
  }, []);

  useEffect(() => {
    return () => {
      countdownEngine.cancel();
    };
  }, []);

  const playWithCountdown = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg.enabled) {
      await audioEngine.play();
      return;
    }

    await countdownEngine.start(cfg, () => {
      void audioEngine.play();
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

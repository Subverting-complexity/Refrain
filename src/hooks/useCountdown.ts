import { useCallback, useEffect } from 'react';

import * as countdownEngine from '../services/countdownEngine';
import {
  DEFAULT_COUNTDOWN_CONFIG,
  getCountdownConfig,
  sanitizeCountdownConfig,
  setCountdownConfig as writeCountdownConfig,
} from '../services/countdownStore';
import { CountdownConfig, CountdownState } from '../types';
import { useEngineSubscription } from './useEngineSubscription';
import { useLatestRef } from './useLatestRef';
import { usePersistedSetting } from './usePersistedSetting';

const COUNTDOWN_SETTING = {
  read: getCountdownConfig,
  write: writeCountdownConfig,
  fallback: DEFAULT_COUNTDOWN_CONFIG,
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
  const countdownState = useEngineSubscription(
    countdownEngine.subscribe,
    IDLE_STATE,
  );
  // Persisted so a configured lead-in survives leaving the player screen, a
  // track change and a reload, like every other playback preference. Held in
  // component state it reset to "off" on each return to the player.
  const [config, setValue] = usePersistedSetting(COUNTDOWN_SETTING);

  // Snap here as well as in the store so state and storage never disagree: an
  // off-list length must not sit in React state waiting for the next reload to
  // correct it. Mirrors `useSkipInterval`.
  const setConfig = useCallback(
    (next: CountdownConfig) => setValue(sanitizeCountdownConfig(next)),
    [setValue],
  );

  // Keep the latest config/onPlay in refs so the stable callbacks below read
  // current values without being rebuilt.
  const configRef = useLatestRef(config);
  const onPlayRef = useLatestRef(onPlay);

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
    // Ref identities never change, so this callback stays stable.
  }, [configRef, onPlayRef]);

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

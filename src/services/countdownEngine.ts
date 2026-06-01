import { Audio } from 'expo-av';

import { CountdownConfig, CountdownDuration, CountdownState } from '../types';

export type CountdownListener = (state: CountdownState) => void;

const IDLE_STATE: CountdownState = {
  phase: 'idle',
  beatsRemaining: 0,
  totalBeats: 0,
  currentBeat: 0,
};

const DEFAULT_BPM = 120;
const BEATS_PER_BAR = 4;

let currentState: CountdownState = { ...IDLE_STATE };
const listeners = new Set<CountdownListener>();
let timerId: ReturnType<typeof setTimeout> | null = null;
let clickSound: Audio.Sound | null = null;

function notify(state: CountdownState): void {
  for (const cb of listeners) {
    cb(state);
  }
}

export function computeTotalBeats(
  duration: CountdownDuration,
  bpm: number,
): number {
  if (duration.type === 'bars') {
    return duration.bars * BEATS_PER_BAR;
  }
  const effectiveBpm = bpm > 0 ? bpm : DEFAULT_BPM;
  return Math.max(1, Math.round((duration.seconds * effectiveBpm) / 60));
}

export function beatIntervalMs(bpm: number): number {
  const effectiveBpm = bpm > 0 ? bpm : DEFAULT_BPM;
  return 60000 / effectiveBpm;
}

async function loadClick(): Promise<void> {
  if (clickSound) return;
  try {
    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/click.wav'),
      { shouldPlay: false },
    );
    clickSound = sound;
  } catch {
    clickSound = null;
  }
}

async function playClick(): Promise<void> {
  if (!clickSound) return;
  try {
    await clickSound.setPositionAsync(0);
    await clickSound.playAsync();
  } catch {
    // best-effort
  }
}

let startTimestamp = 0;

async function tick(
  config: CountdownConfig,
  onFinished: () => void,
): Promise<void> {
  if (currentState.phase !== 'counting') return;

  if (config.mode === 'metronome') {
    await playClick();
  }

  if (currentState.beatsRemaining <= 1) {
    currentState = {
      phase: 'finished',
      beatsRemaining: 0,
      totalBeats: currentState.totalBeats,
      currentBeat: currentState.totalBeats,
    };
    notify(currentState);
    onFinished();
    return;
  }

  const nextBeat = currentState.currentBeat + 1;
  currentState = {
    phase: 'counting',
    beatsRemaining: currentState.beatsRemaining - 1,
    totalBeats: currentState.totalBeats,
    currentBeat: nextBeat,
  };
  notify(currentState);

  const interval = beatIntervalMs(config.bpm);
  const expectedNext = startTimestamp + nextBeat * interval;
  const delay = Math.max(0, expectedNext - Date.now());
  timerId = setTimeout(() => {
    void tick(config, onFinished);
  }, delay);
}

export async function start(
  config: CountdownConfig,
  onFinished: () => void,
): Promise<void> {
  cancel();

  if (!config.enabled) {
    onFinished();
    return;
  }

  const totalBeats = computeTotalBeats(config.duration, config.bpm);

  if (config.mode === 'metronome') {
    await loadClick();
  }

  currentState = {
    phase: 'counting',
    beatsRemaining: totalBeats,
    totalBeats,
    currentBeat: 0,
  };
  notify(currentState);

  const interval = beatIntervalMs(config.bpm);
  startTimestamp = Date.now();
  timerId = setTimeout(() => {
    void tick(config, onFinished);
  }, interval);
}

export function cancel(): void {
  if (timerId != null) {
    clearTimeout(timerId);
    timerId = null;
  }
  if (currentState.phase !== 'idle') {
    currentState = { ...IDLE_STATE };
    notify(currentState);
  }
}

export async function unload(): Promise<void> {
  cancel();
  if (clickSound) {
    await clickSound.unloadAsync();
    clickSound = null;
  }
}

export function subscribe(cb: CountdownListener): () => void {
  listeners.add(cb);
  cb(currentState);
  return () => {
    listeners.delete(cb);
  };
}

export function getState(): CountdownState {
  return currentState;
}

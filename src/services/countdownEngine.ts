import { AudioPlayer, createAudioPlayer } from 'expo-audio';

import { CountdownConfig, CountdownDuration, CountdownState } from '../types';

export type CountdownListener = (state: CountdownState) => void;

const IDLE_STATE: CountdownState = {
  phase: 'idle',
  beatsRemaining: 0,
  totalBeats: 0,
  currentBeat: 0,
  displayValue: 0,
};

const BEATS_PER_BAR = 4;
// The count-in ticks once per second so the audible click lines up exactly with
// the on-screen number (3 → 2 → 1). One tick = one second = one click.
const TICK_MS = 1000;

let currentState: CountdownState = { ...IDLE_STATE };
const listeners = new Set<CountdownListener>();
let timerId: ReturnType<typeof setTimeout> | null = null;
let clickPlayer: AudioPlayer | null = null;
let startTimestamp = 0;
// Identifies the count-in currently allowed to run. `start` awaits the click
// asset before it schedules anything, so a second start (a double-tapped play,
// or a per-loop count-in landing on a manual play) — or a cancel — can arrive
// while an earlier one is suspended mid-await. Each start claims a fresh id and
// re-checks it after every await; a superseded run bails instead of scheduling
// a second tick loop over the same state, which would otherwise count down at
// double speed and fire `onFinished` twice.
let runId = 0;

function notify(state: CountdownState): void {
  for (const cb of listeners) {
    cb(state);
  }
}

// Total ticks (= seconds = clicks) for a count-in. Seconds-type durations map
// straight to seconds; bar-type durations expand to a beat per bar-quarter,
// each still a one-second tick.
export function computeTotalBeats(duration: CountdownDuration): number {
  if (duration.type === 'bars') {
    return duration.bars * BEATS_PER_BAR;
  }
  return Math.max(1, Math.round(duration.seconds));
}

async function loadClick(): Promise<void> {
  if (clickPlayer) return;
  try {
    clickPlayer = createAudioPlayer(require('../../assets/click.wav'));
  } catch {
    clickPlayer = null;
  }
}

/**
 * Warm up the click sound ahead of time so the first beat isn't late while the
 * asset decodes. Safe to call repeatedly; a no-op once loaded.
 */
export async function preload(): Promise<void> {
  await loadClick();
}

async function playClick(): Promise<void> {
  if (!clickPlayer) return;
  try {
    await clickPlayer.seekTo(0);
    clickPlayer.play();
  } catch {
    // best-effort
  }
}

// Schedule the next tick with drift correction: anchor every beat to the
// original start so accumulated setTimeout slop can't make the count-in drift.
// `run` is the id of the count-in this tick belongs to (see `runId`).
function scheduleNext(
  run: number,
  config: CountdownConfig,
  onFinished: () => void,
): void {
  const nextBeat = currentState.currentBeat + 1;
  const delay = Math.max(0, startTimestamp + nextBeat * TICK_MS - Date.now());
  timerId = setTimeout(() => {
    void tick(run, config, onFinished);
  }, delay);
}

async function tick(
  run: number,
  config: CountdownConfig,
  onFinished: () => void,
): Promise<void> {
  if (run !== runId) return;
  if (currentState.phase !== 'counting') return;

  // The just-elapsed second was the last one: time to play.
  if (currentState.beatsRemaining <= 1) {
    currentState = {
      phase: 'finished',
      beatsRemaining: 0,
      totalBeats: currentState.totalBeats,
      currentBeat: currentState.totalBeats,
      displayValue: 0,
    };
    notify(currentState);
    onFinished();
    return;
  }

  const nextBeat = currentState.currentBeat + 1;
  const beatsRemaining = currentState.beatsRemaining - 1;
  currentState = {
    phase: 'counting',
    beatsRemaining,
    totalBeats: currentState.totalBeats,
    currentBeat: nextBeat,
    displayValue: beatsRemaining,
  };
  notify(currentState);

  if (config.mode === 'metronome') {
    await playClick();
    if (run !== runId) return;
  }

  scheduleNext(run, config, onFinished);
}

export async function start(
  config: CountdownConfig,
  onFinished: () => void,
): Promise<void> {
  cancel();
  const run = ++runId;

  if (!config.enabled) {
    onFinished();
    return;
  }

  const totalBeats = computeTotalBeats(config.duration);

  if (config.mode === 'metronome') {
    await loadClick();
    if (run !== runId) return;
  }

  startTimestamp = Date.now();
  currentState = {
    phase: 'counting',
    beatsRemaining: totalBeats,
    totalBeats,
    currentBeat: 0,
    displayValue: totalBeats,
  };
  notify(currentState);

  // Click on the very first second (the downbeat) so there's an immediate beat
  // instead of a silent gap before the first tick.
  if (config.mode === 'metronome') {
    await playClick();
    if (run !== runId) return;
  }

  scheduleNext(run, config, onFinished);
}

export function cancel(): void {
  // Retire the current run so a `start` still suspended on its click-asset
  // await can't schedule a tick loop after this cancel.
  runId++;
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
  if (clickPlayer) {
    clickPlayer.remove();
    clickPlayer = null;
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

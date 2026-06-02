import { Audio, AVPlaybackStatus } from 'expo-av';

import { PlaybackState, PlaybackStatus } from '../types';

export type PlaybackListener = (state: PlaybackState) => void;

const IDLE_STATE: PlaybackState = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  markerA: null,
  markerB: null,
};

let sound: Audio.Sound | null = null;
const listeners = new Set<PlaybackListener>();
let currentState: PlaybackState = { ...IDLE_STATE };
let markerA: number | null = null;
let markerB: number | null = null;

function notify(state: PlaybackState): void {
  for (const cb of listeners) {
    cb(state);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return 'Unknown error';
}

function parseStatus(avStatus: AVPlaybackStatus): PlaybackState {
  if (!avStatus.isLoaded) {
    return { ...IDLE_STATE, markerA, markerB };
  }

  let status: PlaybackStatus = 'paused';
  if (avStatus.isPlaying) {
    status = 'playing';
  } else if (avStatus.isBuffering) {
    status = 'loading';
  }

  return {
    status,
    positionMs: avStatus.positionMillis,
    durationMs: avStatus.durationMillis ?? 0,
    markerA,
    markerB,
  };
}

function onPlaybackStatusUpdate(avStatus: AVPlaybackStatus): void {
  if (!avStatus.isLoaded && avStatus.error) {
    currentState = {
      status: 'error',
      positionMs: 0,
      durationMs: 0,
      markerA,
      markerB,
      lastError: errorMessage(avStatus.error),
    };
    notify(currentState);
    return;
  }

  const newState = parseStatus(avStatus);

  if (avStatus.isLoaded && avStatus.didJustFinish) {
    newState.status = 'paused';
    newState.positionMs = newState.durationMs;
  }

  if (
    avStatus.isLoaded &&
    avStatus.isPlaying &&
    markerA != null &&
    markerB != null &&
    newState.positionMs >= markerB
  ) {
    const loopStart = markerA;
    if (sound) {
      sound.setPositionAsync(loopStart).catch((err) => {
        currentState = {
          ...currentState,
          status: 'error',
          lastError: errorMessage(err),
        };
        notify(currentState);
      });
    }
    // Publish the loop restart immediately so the cursor jumps cleanly
    // back to marker A instead of stalling at the overshoot position
    // (up to progressUpdateIntervalMillis past marker B) until the next
    // status update arrives.
    currentState = { ...newState, positionMs: loopStart };
    notify(currentState);
    return;
  }

  currentState = newState;
  notify(currentState);
}

export async function loadTrack(uri: string): Promise<void> {
  try {
    await unloadTrack();

    currentState = {
      status: 'loading',
      positionMs: 0,
      durationMs: 0,
      markerA: null,
      markerB: null,
    };
    notify(currentState);

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });

    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, progressUpdateIntervalMillis: 100 },
      onPlaybackStatusUpdate,
    );
    sound = newSound;
  } catch (err) {
    currentState = {
      status: 'error',
      positionMs: 0,
      durationMs: 0,
      markerA: null,
      markerB: null,
      lastError: errorMessage(err),
    };
    notify(currentState);
  }
}

export async function play(): Promise<void> {
  if (!sound) return;
  if (
    currentState.status === 'paused' &&
    currentState.positionMs >= currentState.durationMs &&
    currentState.durationMs > 0
  ) {
    await sound.setPositionAsync(markerA ?? 0);
  }
  await sound.playAsync();
}

export async function pause(): Promise<void> {
  if (!sound) return;
  await sound.pauseAsync();
}

export async function stop(): Promise<void> {
  if (!sound) return;
  await sound.stopAsync();
  await sound.setPositionAsync(markerA ?? 0);
}

export async function seekTo(positionMs: number): Promise<void> {
  if (!sound) return;
  await sound.setPositionAsync(positionMs);
}

export async function unloadTrack(): Promise<void> {
  if (sound) {
    sound.setOnPlaybackStatusUpdate(null);
    await sound.unloadAsync();
    sound = null;
  }
  markerA = null;
  markerB = null;
  currentState = { ...IDLE_STATE };
  notify(currentState);
}

export function setMarkerA(positionMs: number): void {
  markerA = positionMs;
  if (markerB != null && positionMs >= markerB) {
    markerB = null;
  }
  currentState = { ...currentState, markerA, markerB };
  notify(currentState);
}

export function setMarkerB(positionMs: number): void {
  if (markerA != null && positionMs <= markerA) return;
  markerB = positionMs;
  currentState = { ...currentState, markerB };
  notify(currentState);
}

export function clearMarkers(): void {
  markerA = null;
  markerB = null;
  currentState = { ...currentState, markerA: null, markerB: null };
  notify(currentState);
}

export function subscribe(cb: PlaybackListener): () => void {
  listeners.add(cb);
  cb(currentState);
  return () => {
    listeners.delete(cb);
  };
}

export function getState(): PlaybackState {
  return currentState;
}

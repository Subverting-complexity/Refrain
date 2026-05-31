import { Audio, AVPlaybackStatus } from 'expo-av';

import { PlaybackState, PlaybackStatus } from '../types';

export type PlaybackListener = (state: PlaybackState) => void;

const IDLE_STATE: PlaybackState = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
};

let sound: Audio.Sound | null = null;
const listeners = new Set<PlaybackListener>();
let currentState: PlaybackState = { ...IDLE_STATE };

function notify(state: PlaybackState): void {
  for (const cb of listeners) {
    cb(state);
  }
}

function parseStatus(avStatus: AVPlaybackStatus): PlaybackState {
  if (!avStatus.isLoaded) {
    return { ...IDLE_STATE };
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
  };
}

function onPlaybackStatusUpdate(avStatus: AVPlaybackStatus): void {
  if (!avStatus.isLoaded && avStatus.error) {
    currentState = { status: 'error', positionMs: 0, durationMs: 0 };
    notify(currentState);
    return;
  }

  const newState = parseStatus(avStatus);

  if (avStatus.isLoaded && avStatus.didJustFinish) {
    newState.status = 'paused';
    newState.positionMs = newState.durationMs;
  }

  currentState = newState;
  notify(currentState);
}

export async function loadTrack(uri: string): Promise<void> {
  await unloadTrack();

  currentState = { status: 'loading', positionMs: 0, durationMs: 0 };
  notify(currentState);

  try {
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
  } catch {
    currentState = { status: 'error', positionMs: 0, durationMs: 0 };
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
    await sound.setPositionAsync(0);
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
  await sound.setPositionAsync(0);
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
  currentState = { ...IDLE_STATE };
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

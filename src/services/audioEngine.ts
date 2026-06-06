import { Audio, AVPlaybackStatus } from 'expo-av';
import { Platform } from 'react-native';

import * as settingsStore from './settingsStore';
import * as webAudioGain from './webAudioGain';
import { PlaybackState, PlaybackStatus } from '../types';

export type PlaybackListener = (state: PlaybackState) => void;

const VOLUME_SETTING_KEY = 'playback.volume';
const DEFAULT_VOLUME = 1;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, value));
}

let sound: Audio.Sound | null = null;
const listeners = new Set<PlaybackListener>();
let markerA: number | null = null;
let markerB: number | null = null;
// App-level playback volume (0..1). Applied to every loaded track and
// persisted so it survives reload and track changes.
let volume = DEFAULT_VOLUME;
// True once the current web track is routed through the Web Audio gain graph
// (iOS-Safari true attenuation). When false, volume goes through expo-av's
// native `setVolumeAsync` path. Always false on native platforms.
let webGainActive = false;

/**
 * The internal `HTMLAudioElement` backing an expo-av web `Sound`, or null when
 * unavailable. Relies on the private `_key` field, so it is guarded heavily:
 * a missing field or an expo-av internal change yields null and the caller
 * falls back to the native volume path.
 */
function getWebMediaElement(s: Audio.Sound): HTMLMediaElement | null {
  if (Platform.OS !== 'web') return null;
  if (typeof HTMLMediaElement === 'undefined') return null;
  const candidate = (s as unknown as { _key?: unknown })._key;
  return candidate instanceof HTMLMediaElement ? candidate : null;
}

const IDLE_STATE: Omit<PlaybackState, 'volume'> = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  markerA: null,
  markerB: null,
};

function idleState(): PlaybackState {
  return { ...IDLE_STATE, volume };
}

let currentState: PlaybackState = idleState();

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
    return { ...IDLE_STATE, markerA, markerB, volume };
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
    volume,
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
      volume,
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
      volume,
    };
    notify(currentState);

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });

    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri },
      // Seed the current volume at creation so the very first frame plays at
      // the persisted level; setVolume() handles later live changes.
      { shouldPlay: false, volume, progressUpdateIntervalMillis: 100 },
      onPlaybackStatusUpdate,
    );
    sound = newSound;

    // On web, try to route through a Web Audio gain graph so volume actually
    // attenuates on iOS Safari. On success the media element plays at full
    // volume and gain does the attenuation, avoiding double-application on
    // desktop. Any failure falls back to expo-av's `setVolumeAsync` path.
    webGainActive = false;
    const media = getWebMediaElement(newSound);
    if (media && webAudioGain.attach(media)) {
      try {
        media.volume = 1;
        webAudioGain.setGain(volume);
        webGainActive = true;
      } catch {
        webAudioGain.detach();
        webGainActive = false;
      }
    }
  } catch (err) {
    currentState = {
      status: 'error',
      positionMs: 0,
      durationMs: 0,
      markerA: null,
      markerB: null,
      volume,
      lastError: errorMessage(err),
    };
    notify(currentState);
  }
}

export async function play(): Promise<void> {
  if (!sound) return;
  // Resume the audio graph on this user gesture so iOS's autoplay policy
  // can't leave the rerouted output silently suspended.
  if (webGainActive) webAudioGain.resume();
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
  if (webGainActive) {
    webAudioGain.detach();
    webGainActive = false;
  }
  if (sound) {
    sound.setOnPlaybackStatusUpdate(null);
    await sound.unloadAsync();
    sound = null;
  }
  markerA = null;
  markerB = null;
  currentState = idleState();
  notify(currentState);
}

export function getVolume(): number {
  return volume;
}

/**
 * Set the app-level playback volume (clamped to 0..1), apply it to the loaded
 * track, persist it, and notify listeners.
 *
 * Platform note: when the web track is routed through the Web Audio gain graph
 * (`webGainActive`), volume is applied via the gain node so it attenuates even
 * on iOS Safari, where programmatic `HTMLMediaElement.volume` is ignored.
 * Otherwise `setVolumeAsync` adjusts app-level gain on iOS/Android native and
 * desktop web. The value is always stored and reflected in the UI so
 * behaviour is consistent across platforms.
 */
export function setVolume(value: number): void {
  volume = clampVolume(value);
  if (webGainActive) {
    // Attenuate via the gain node. Resume on this user gesture so a drag can
    // wake a context the autoplay policy left suspended.
    webAudioGain.setGain(volume);
    webAudioGain.resume();
  } else if (sound) {
    // expo-av rejects if the sound unloaded mid-flight; swallow so a volume
    // tweak can never surface as a playback error.
    void sound.setVolumeAsync(volume).catch(() => undefined);
  }
  try {
    settingsStore.setNumber(VOLUME_SETTING_KEY, volume);
  } catch {
    // Persistence is best-effort: a failed write must not break playback.
  }
  currentState = { ...currentState, volume };
  notify(currentState);
}

/**
 * Load the persisted volume from storage into the engine. Call once on app
 * start (before the first track loads) so playback honours the saved level.
 * Best-effort: falls back to the default on any storage error.
 */
export function loadPersistedVolume(): void {
  try {
    volume = clampVolume(
      settingsStore.getNumber(VOLUME_SETTING_KEY, DEFAULT_VOLUME),
    );
  } catch {
    volume = DEFAULT_VOLUME;
  }
  currentState = { ...currentState, volume };
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

/**
 * Set the B (loop end) marker. Returns `true` when the placement is
 * applied, or `false` when it is rejected because B would fall at or
 * before A (the A < B invariant must hold). Callers use the boolean to
 * surface feedback instead of failing silently.
 */
export function setMarkerB(positionMs: number): boolean {
  if (markerA != null && positionMs <= markerA) return false;
  markerB = positionMs;
  currentState = { ...currentState, markerB };
  notify(currentState);
  return true;
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

import {
  AudioPlayer,
  AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';
import type { EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';

import * as settingsStore from './settingsStore';
import * as webAudioGain from './webAudioGain';
import { PlaybackState, PlaybackStatus } from '../types';

export type PlaybackListener = (state: PlaybackState) => void;

const VOLUME_SETTING_KEY = 'playback.volume';
const DEFAULT_VOLUME = 1;

// expo-audio reports time in seconds; the engine's public contract is in
// milliseconds (markers, positionMs/durationMs), so convert at the boundary.
const secToMs = (seconds: number): number => Math.round(seconds * 1000);
const msToSec = (ms: number): number => ms / 1000;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, value));
}

let player: AudioPlayer | null = null;
let statusSubscription: EventSubscription | null = null;
const listeners = new Set<PlaybackListener>();
let markerA: number | null = null;
let markerB: number | null = null;
// Whether the A/B loop is armed. Defaults to on so setting both markers
// loops immediately; the user can toggle it off to keep markers but play
// straight through. Reset to the default on every new track.
let loopEnabled = true;
// App-level playback volume (0..1). Applied to every loaded track and
// persisted so it survives reload and track changes.
let volume = DEFAULT_VOLUME;
// True once the current web track is routed through the Web Audio gain graph
// (iOS-Safari true attenuation). When false, volume goes through the
// AudioPlayer's `volume` property. Always false on native platforms.
let webGainActive = false;

/**
 * The internal `HTMLAudioElement` backing an expo-audio web player, or null when
 * unavailable. Relies on the private `media` field, so it is guarded heavily:
 * a missing field or an expo-audio internal change yields null and the caller
 * falls back to the native volume path.
 */
function getWebMediaElement(p: AudioPlayer): HTMLMediaElement | null {
  if (Platform.OS !== 'web') return null;
  if (typeof HTMLMediaElement === 'undefined') return null;
  const candidate = (p as unknown as { media?: unknown }).media;
  return candidate instanceof HTMLMediaElement ? candidate : null;
}

const IDLE_STATE: Omit<PlaybackState, 'volume' | 'loopEnabled'> = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  markerA: null,
  markerB: null,
};

function idleState(): PlaybackState {
  return { ...IDLE_STATE, volume, loopEnabled };
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

function parseStatus(status: AudioStatus): PlaybackState {
  if (!status.isLoaded) {
    return { ...IDLE_STATE, markerA, markerB, loopEnabled, volume };
  }

  let playbackStatus: PlaybackStatus = 'paused';
  if (status.playing) {
    playbackStatus = 'playing';
  } else if (status.isBuffering) {
    playbackStatus = 'loading';
  }

  return {
    status: playbackStatus,
    positionMs: secToMs(status.currentTime),
    durationMs: secToMs(status.duration),
    markerA,
    markerB,
    loopEnabled,
    volume,
  };
}

function onPlaybackStatusUpdate(status: AudioStatus): void {
  if (status.error) {
    currentState = {
      status: 'error',
      positionMs: 0,
      durationMs: 0,
      markerA,
      markerB,
      loopEnabled,
      volume,
      lastError: errorMessage(status.error),
    };
    notify(currentState);
    return;
  }

  const newState = parseStatus(status);

  if (status.isLoaded && status.didJustFinish) {
    newState.status = 'paused';
    newState.positionMs = newState.durationMs;
  }

  if (
    status.isLoaded &&
    (status.playing || status.didJustFinish) &&
    loopEnabled &&
    markerA != null &&
    markerB != null &&
    newState.positionMs >= markerB
  ) {
    const loopStart = markerA;
    if (player) {
      player.seekTo(msToSec(loopStart)).catch((err) => {
        currentState = {
          ...currentState,
          status: 'error',
          lastError: errorMessage(err),
        };
        notify(currentState);
      });
      // When the track reached its natural end, the player auto-pauses.
      // Restart it so the loop continues seamlessly.
      if (status.didJustFinish) {
        player.play();
      }
    }
    // Publish the loop restart immediately so the cursor jumps cleanly
    // back to marker A instead of stalling at the overshoot position
    // (up to updateInterval past marker B) until the next status update
    // arrives. Force 'playing' because a didJustFinish override may have
    // set the status to 'paused'.
    currentState = { ...newState, positionMs: loopStart, status: 'playing' };
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
      loopEnabled,
      volume,
    };
    notify(currentState);

    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });

    const newPlayer = createAudioPlayer({ uri }, { updateInterval: 100 });
    // Seed the current volume so the very first frame plays at the persisted
    // level; setVolume() handles later live changes.
    newPlayer.volume = volume;
    statusSubscription = newPlayer.addListener(
      'playbackStatusUpdate',
      onPlaybackStatusUpdate,
    );
    player = newPlayer;

    // On web, try to route through a Web Audio gain graph so volume actually
    // attenuates on iOS Safari. On success the media element plays at full
    // volume and gain does the attenuation, avoiding double-application on
    // desktop. Any failure falls back to the player's `volume` property.
    webGainActive = false;
    const media = getWebMediaElement(newPlayer);
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
      loopEnabled,
      volume,
      lastError: errorMessage(err),
    };
    notify(currentState);
  }
}

export async function play(): Promise<void> {
  if (!player) return;
  // Resume the audio graph on this user gesture so iOS's autoplay policy
  // can't leave the rerouted output silently suspended.
  if (webGainActive) webAudioGain.resume();
  if (
    currentState.status === 'paused' &&
    currentState.positionMs >= currentState.durationMs &&
    currentState.durationMs > 0
  ) {
    await player.seekTo(msToSec(markerA ?? 0));
  }
  player.play();
}

export async function pause(): Promise<void> {
  if (!player) return;
  player.pause();
}

export async function stop(): Promise<void> {
  if (!player) return;
  // expo-audio has no stop(); emulate by pausing and rewinding.
  player.pause();
  await player.seekTo(msToSec(markerA ?? 0));
}

export async function seekTo(positionMs: number): Promise<void> {
  if (!player) return;
  await player.seekTo(msToSec(positionMs));
}

export async function unloadTrack(): Promise<void> {
  if (webGainActive) {
    webAudioGain.detach();
    webGainActive = false;
  }
  if (statusSubscription) {
    statusSubscription.remove();
    statusSubscription = null;
  }
  if (player) {
    player.remove();
    player = null;
  }
  markerA = null;
  markerB = null;
  loopEnabled = true;
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
 * Otherwise the player's `volume` property adjusts app-level gain on iOS/Android
 * native and desktop web. The value is always stored and reflected in the UI so
 * behaviour is consistent across platforms.
 */
export function setVolume(value: number): void {
  volume = clampVolume(value);
  if (webGainActive) {
    // Attenuate via the gain node. Resume on this user gesture so a drag can
    // wake a context the autoplay policy left suspended.
    webAudioGain.setGain(volume);
    webAudioGain.resume();
  } else if (player) {
    // Setting volume can throw if the player was released mid-flight; swallow
    // so a volume tweak can never surface as a playback error.
    try {
      player.volume = volume;
    } catch {
      // best-effort
    }
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

/**
 * Arm or disarm the A/B loop without touching the markers. When disabled,
 * playback runs straight through marker B instead of rewinding to A, so the
 * user can audition the surrounding context and re-arm the loop later.
 */
export function setLoopEnabled(enabled: boolean): void {
  loopEnabled = enabled;
  currentState = { ...currentState, loopEnabled };
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

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
// loops immediately; the user can toggle it off to play the region once and
// stop at B instead of rewinding. Reset to the default on every new track.
let loopEnabled = true;
// Optional handler invoked when the loop rewinds to A. When set (a per-loop
// count-in is configured), the engine pauses at A and hands off so the
// caller can run a lead-in before resuming. Null = loop continues seamlessly.
let onLoopRestart: (() => void) | null = null;
// App-level playback volume (0..1). Applied to every loaded track and
// persisted so it survives reload and track changes.
let volume = DEFAULT_VOLUME;
// True once the current web track is routed through the Web Audio gain graph
// (iOS-Safari true attenuation). When false, volume goes through the
// AudioPlayer's `volume` property. Always false on native platforms.
let webGainActive = false;

// --- Rolling monitor (marker-drag preview) ----------------------------------
// A transient preview mode: while a marker is being dragged, a short window
// around the marker loops so the user can hear where they are, then the prior
// transport state is restored on release. The monitor never mutates markerA/
// markerB/loopEnabled — it overrides the active loop region for its lifetime
// only. See startMonitor/updateMonitor/stopMonitor below.

// Half-width of the preview window: 2s before to 2s after the center.
const MONITOR_HALF_WINDOW_MS = 2000;

// Whether the rolling monitor is currently previewing.
let monitorActive = false;
// The current preview window in ms, clamped to the track, or null when idle.
let monitorWindow: { start: number; end: number } | null = null;
// Transport state captured at startMonitor, restored verbatim at stopMonitor.
let savedTransport: { positionMs: number; isPlaying: boolean } | null = null;

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

  // The monitor window, when active, overrides the A/B region: the preview
  // loops its own window and always rewinds (it ignores the loop toggle and
  // any per-loop count-in handler), so a marker drag previews cleanly without
  // touching the user's loop settings.
  const monitor = monitorBounds();
  const region = monitor ?? regionBounds();
  if (
    status.isLoaded &&
    (status.playing || status.didJustFinish) &&
    region &&
    newState.positionMs >= region.b &&
    player
  ) {
    if (!monitor && !loopEnabled) {
      // Loop disarmed: play the A..B region once, then stop at B. The next
      // play() restarts from A (see play()).
      player.pause();
      currentState = { ...newState, positionMs: region.b, status: 'paused' };
      notify(currentState);
      return;
    }

    // Loop armed (or monitor active): rewind to the start.
    player.seekTo(msToSec(region.a)).catch((err) => {
      currentState = {
        ...currentState,
        status: 'error',
        lastError: errorMessage(err),
      };
      notify(currentState);
    });

    if (!monitor && onLoopRestart) {
      // A per-loop count-in is registered: pause at A and hand off so the
      // caller can run the lead-in before resuming.
      player.pause();
      currentState = { ...newState, positionMs: region.a, status: 'paused' };
      notify(currentState);
      onLoopRestart();
      return;
    }

    // When the track reached its natural end, the player auto-pauses.
    // Restart it so the loop continues seamlessly.
    if (status.didJustFinish) {
      player.play();
    }
    // Publish the loop restart immediately so the cursor jumps cleanly
    // back to marker A instead of stalling at the overshoot position
    // (up to updateInterval past marker B) until the next status update
    // arrives. Force 'playing' because a didJustFinish override may have
    // set the status to 'paused'.
    currentState = { ...newState, positionMs: region.a, status: 'playing' };
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

  const region = regionBounds();
  if (region) {
    // With an A/B region set, playback is confined to it: (re)start from A
    // whenever the playhead sits outside [A, B) — so a one-shot that stopped
    // at B, or a fresh play before A, begins at the loop start. A pause in
    // the middle of the region still resumes in place.
    if (
      currentState.positionMs < region.a ||
      currentState.positionMs >= region.b
    ) {
      await player.seekTo(msToSec(region.a));
    }
  } else if (
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

/**
 * The active A/B region, or null when both markers aren't set (or A is not
 * before B). When set, seeks and skips are confined to [a, b] so the playhead
 * stays inside the region — independent of whether the loop is armed (the loop
 * toggle only decides whether reaching B rewinds or stops).
 */
function regionBounds(): { a: number; b: number } | null {
  if (markerA == null || markerB == null) return null;
  if (markerA >= markerB) return null;
  return { a: markerA, b: markerB };
}

/**
 * The active monitor window expressed as loop bounds, or null when the monitor
 * is idle. Shares the `{ a, b }` shape with `regionBounds()` so the status
 * handler can treat it as a drop-in loop region that takes precedence over the
 * A/B markers while a preview is running.
 */
function monitorBounds(): { a: number; b: number } | null {
  if (!monitorActive || monitorWindow == null) return null;
  return { a: monitorWindow.start, b: monitorWindow.end };
}

/**
 * Build the preview window `[center-2000, center+2000]` clamped to the track.
 * The upper bound falls back to the raw window end when the duration isn't
 * known yet (e.g. the very first preview before a status update lands), so the
 * window is always a non-empty, ordered range.
 */
function computeMonitorWindow(centerMs: number): {
  start: number;
  end: number;
} {
  const duration = currentState.durationMs;
  const upper = duration > 0 ? duration : centerMs + MONITOR_HALF_WINDOW_MS;
  const start = Math.max(0, Math.min(centerMs - MONITOR_HALF_WINDOW_MS, upper));
  const end = Math.max(
    start,
    Math.min(centerMs + MONITOR_HALF_WINDOW_MS, upper),
  );
  return { start, end };
}

export async function seekTo(positionMs: number): Promise<void> {
  if (!player) return;
  const bounds = regionBounds();
  const target = bounds
    ? Math.max(bounds.a, Math.min(positionMs, bounds.b))
    : positionMs;
  await player.seekTo(msToSec(target));
}

/**
 * Skip the playhead by a signed millisecond delta. Movement is clamped to the
 * active A/B region when one is set, otherwise to the full track, so skip works
 * "within A and B" with markers set and across the whole track otherwise.
 */
export async function skipBy(deltaMs: number): Promise<void> {
  if (!player) return;
  const bounds = regionBounds();
  const lo = bounds ? bounds.a : 0;
  const hi = bounds ? bounds.b : currentState.durationMs;
  const next = Math.max(lo, Math.min(currentState.positionMs + deltaMs, hi));
  await player.seekTo(msToSec(next));
}

/**
 * Begin a rolling monitor preview around `centerMs`: seek to a short window
 * `[centerMs-2000, centerMs+2000]` (clamped to the track) and loop it so the
 * user hears where a marker sits while dragging it. The transport state
 * (playhead position and whether playback was running) is captured on the
 * first call and restored exactly by `stopMonitor`.
 *
 * The preview overrides the A/B loop region for its lifetime but never mutates
 * `markerA`/`markerB`/`loopEnabled`. Calling `startMonitor` again while already
 * monitoring just moves the window (the captured transport state is kept), so
 * it is safe to treat repeated starts as updates.
 */
export async function startMonitor(centerMs: number): Promise<void> {
  if (!player) return;
  if (!monitorActive) {
    // Capture the prior transport once, on entry, so a second startMonitor
    // (or any updateMonitor) can't overwrite the state we must restore.
    savedTransport = {
      positionMs: currentState.positionMs,
      isPlaying: currentState.status === 'playing',
    };
    monitorActive = true;
  }
  monitorWindow = computeMonitorWindow(centerMs);
  // Resume the web audio graph on this gesture so the preview isn't left
  // silently suspended by the autoplay policy (mirrors play()).
  if (webGainActive) webAudioGain.resume();
  await player.seekTo(msToSec(monitorWindow.start));
  player.play();
}

/**
 * Move the rolling monitor to follow a new center position. Cheap enough to
 * call at the drag-throttle rate (~20/sec). No-op when the monitor isn't
 * running.
 *
 * Platform note: continuous per-update re-seeking scrubs badly on web / iOS
 * Safari — seeking an `HTMLMediaElement` mid-playback stalls and clicks. So the
 * preview degrades gracefully there: on web it only moves the loop bounds and
 * lets the looping window carry the playhead into the new region at the next
 * rewind (it follows the marker at loop granularity rather than frame-tight).
 * On native it re-seeks to keep the playhead inside the moved window so the
 * preview tracks the marker continuously.
 */
export function updateMonitor(centerMs: number): void {
  if (!monitorActive || !player) return;
  monitorWindow = computeMonitorWindow(centerMs);

  if (Platform.OS === 'web') {
    // Web fallback: bounds-only follow, no per-update seek (see note above).
    return;
  }

  // Native: pull the playhead back into the window only when it has fallen
  // outside the freshly moved bounds, so small drags don't restart playback
  // and large jumps still keep audio within [center-2s, center+2s].
  const pos = currentState.positionMs;
  if (pos < monitorWindow.start || pos >= monitorWindow.end) {
    player.seekTo(msToSec(monitorWindow.start)).catch(() => {
      // Best-effort: a failed follow-seek must not break the drag.
    });
  }
}

/**
 * Stop the rolling monitor and fully restore the transport captured at
 * `startMonitor`: seek back to the prior playhead and resume or pause to match
 * the prior play/pause state. No-op when the monitor isn't running.
 */
export async function stopMonitor(): Promise<void> {
  if (!monitorActive) return;
  const saved = savedTransport;
  monitorActive = false;
  monitorWindow = null;
  savedTransport = null;

  if (!player) return;

  // Restore the exact prior playhead, then the prior play/pause state.
  await player.seekTo(msToSec(saved ? saved.positionMs : 0));
  if (saved?.isPlaying) {
    player.play();
  } else {
    player.pause();
  }
}

/**
 * Register (or clear, with null) a handler invoked when the armed loop rewinds
 * to A. When set, the engine pauses at A and calls the handler instead of
 * playing straight through, letting the caller run a per-loop count-in and
 * resume via play(). Safe to call repeatedly; only the latest handler is kept.
 */
export function setLoopRestartHandler(handler: (() => void) | null): void {
  onLoopRestart = handler;
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
  // A monitor preview is transient and track-scoped: tear it down so neither
  // its window nor the captured transport leaks into the next track.
  monitorActive = false;
  monitorWindow = null;
  savedTransport = null;
  // Per-loop count-in is a per-session concern: drop any handler so it can't
  // leak into the next track and pause the loop for a track that never armed
  // one. The player re-registers it from the count-in config when needed.
  onLoopRestart = null;
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

/** Clear only the B (loop end) marker, leaving A in place so it can be
 * re-placed without redoing A. */
export function clearMarkerB(): void {
  markerB = null;
  currentState = { ...currentState, markerB: null };
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

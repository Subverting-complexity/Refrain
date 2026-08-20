import {
  AudioPlayer,
  AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from 'expo-audio';
import type { EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';

import * as markerStore from './markerStore';
import * as settingsStore from './settingsStore';
import {
  DEFAULT_SKIP_PREFERENCE,
  getSkipPreference,
  SkipPreference,
} from './skipIntervalStore';
import * as webAudioGain from './webAudioGain';
import * as webMediaSession from './webMediaSession';
import { ActiveMarkers, PlaybackState, PlaybackStatus } from '../types';
import { errorMessage } from '../utils/errorMessage';
import { settle } from '../utils/settle';

export type PlaybackListener = (state: PlaybackState) => void;

const VOLUME_SETTING_KEY = 'playback.volume';
const DEFAULT_VOLUME = 1;

// Trailing-edge debounce for per-track marker writes. A marker drag fires
// changes at the ~20/sec drag-throttle cadence; coalescing them into one write
// this far after the last change avoids a write storm while still capturing the
// final value (the timer always writes the latest markers, never a stale one).
const MARKER_SAVE_DEBOUNCE_MS = 300;

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
// The id of the loaded track, used to key its persisted marker set. Null when
// no track is loaded or the loader was called without one (markers then live
// only in memory, as before). Set by loadTrack, cleared by unloadTrack.
let currentTrackId: string | null = null;
// Pending debounced marker-save timer, or null when no write is queued.
let markerSaveTimer: ReturnType<typeof setTimeout> | null = null;

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
// True while stopMonitor's restore seek is in flight. The monitor window is
// already cleared by then, so without this the status handler would fall
// through to the A/B region and, if the preview sat at or past marker B,
// issue its own rewind — racing the restore and stealing the playhead the
// user had before the drag.
let restoringTransport = false;

// --- Lock-screen skip interception (native) ---------------------------------
// expo-audio 56 wires the lock-screen seek buttons entirely in native code: iOS
// sets `skipForwardCommand.preferredIntervals = [10.0]` and seeks the AVPlayer
// itself (ios/MediaController.swift); Android seeks by a `SEEK_INTERVAL_MS` of
// 10000 (service/AudioControlsService.kt). Neither interval is configurable and
// neither fires a JS callback, so a lock-screen press reaches us only as an
// unexplained jump in `playbackStatusUpdate`.
//
// To honour the user's skip preference — and to keep the playhead inside the
// A/B region, which the native seek knows nothing about — the engine spots that
// jump and re-seeks to the position the preference actually asked for. Web does
// not need any of this: `webMediaSession` registers real seek handlers that run
// our own skip path.
const NATIVE_LOCK_SCREEN_SKIP_MS = 10_000;

// How far a reported jump may sit from the native interval and still count as
// one. Generous enough to absorb a status tick landing mid-seek (the player
// reports every 100ms) without being wide enough to swallow an ordinary
// playback advance.
const LOCK_SCREEN_SKIP_TOLERANCE_MS = 750;

// How many status updates a seek we issued ourselves may take to land before we
// stop waiting for it. Without a bound, a seek that resolves to a clamped
// position (track end, a rejected seek) would suppress detection forever.
const PENDING_SEEK_TICKS = 20;

// The position of the previous status update, used to measure a jump. Null
// before the first update of a track.
let lastReportedPositionMs: number | null = null;

// A seek this module issued, tracked so its arrival is never mistaken for a
// lock-screen press. Cleared once the reported position reaches it, or once the
// tick budget runs out.
let pendingSeek: { targetMs: number; ticksRemaining: number } | null = null;

/**
 * Record a seek we are about to perform, so the resulting jump in
 * `playbackStatusUpdate` is recognised as ours. Native-only bookkeeping; the
 * detection it feeds never runs on web.
 */
function markInternalSeek(targetMs: number): void {
  pendingSeek = { targetMs, ticksRemaining: PENDING_SEEK_TICKS };
}

/** Seek the player and record it as internal. */
async function seekInternal(targetMs: number): Promise<void> {
  if (!player) return;
  markInternalSeek(targetMs);
  await player.seekTo(msToSec(targetMs));
}

/**
 * Start or stop playback and keep the OS media overlay in step.
 *
 * On web the overlay's state is a value we publish, not something the browser
 * derives, so every transport change has to go through here. The exported
 * play/pause mirrored it, but the engine's own changes — stopping at marker B
 * with the loop disarmed, pausing at A to hand off to a count-in, resuming
 * after the track ran out, restoring the transport after a marker drag — did
 * not. The overlay then claimed the opposite of what was happening, and a
 * hardware media key sent the action for that wrong state: pressing play on a
 * paused track dispatched `pause`, so the key appeared dead. Native derives
 * the state from the player itself and needs none of this.
 */
function startPlayback(target: AudioPlayer): void {
  target.play();
  if (Platform.OS === 'web') webMediaSession.setPlaybackState('playing');
}

function stopPlayback(target: AudioPlayer): void {
  target.pause();
  if (Platform.OS === 'web') webMediaSession.setPlaybackState('paused');
}

/**
 * Publish a failed background seek as an error — but only while the player it
 * was issued against is still the live one.
 *
 * Releasing a player rejects any seek already in flight, and teardown has by
 * then reset `currentState` to idle. Reporting unconditionally would stamp an
 * error over that idle state, and because `subscribe` replays `currentState`
 * to every new subscriber, the *next* track would open showing the previous
 * track's teardown error.
 */
function reportSeekFailure(target: AudioPlayer | null, err: unknown): void {
  if (player !== target) return;
  currentState = {
    ...currentState,
    status: 'error',
    lastError: errorMessage(err),
  };
  notify(currentState);
}

/**
 * The persisted skip preference, or the default when storage is unreachable.
 * A failed settings read must never break the transport — the buttons still
 * have to move the playhead.
 */
function readSkipPreference(): SkipPreference {
  try {
    return getSkipPreference();
  } catch {
    return DEFAULT_SKIP_PREFERENCE;
  }
}

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

/**
 * Deliver a state to one listener without letting its failure out. Most
 * notifications originate inside expo-audio's native `playbackStatusUpdate`
 * callback, and the initial replay happens inside a subscriber's `useEffect` —
 * neither is a place a consumer's throw should surface.
 */
function emit(cb: PlaybackListener, state: PlaybackState): void {
  try {
    cb(state);
  } catch {
    // A subscriber's failure is its own; playback carries on.
  }
}

function notify(state: PlaybackState): void {
  // Iterate a snapshot, and isolate each listener, so one that throws (a
  // consumer setting state after unmount, a caller bug) can neither cut the
  // fan-out short — leaving later subscribers stuck on a stale transport — nor
  // escape into the native event emitter. The snapshot also makes subscribing
  // or unsubscribing from inside a callback safe: either takes effect on the
  // next notify rather than mutating the set mid-pass.
  for (const cb of [...listeners]) {
    emit(cb, state);
  }
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

/**
 * Classify the playhead movement in a status update: a jump matching the native
 * lock-screen interval, with no seek of ours outstanding, is a lock-screen
 * press. Returns the direction and the position it started from, or null when
 * the movement is ordinary playback, our own seek, or off-platform.
 *
 * Always run, even when the answer is null — it owns the bookkeeping that makes
 * the next call meaningful.
 */
function detectLockScreenSkip(
  status: AudioStatus,
  positionMs: number,
): { direction: 1 | -1; fromMs: number } | null {
  const previous = lastReportedPositionMs;
  lastReportedPositionMs = positionMs;

  if (pendingSeek) {
    const landed =
      Math.abs(positionMs - pendingSeek.targetMs) <=
      LOCK_SCREEN_SKIP_TOLERANCE_MS;
    pendingSeek.ticksRemaining -= 1;
    if (landed || pendingSeek.ticksRemaining <= 0) pendingSeek = null;
    // A seek of ours is in flight or has just landed: whatever moved the
    // playhead, it was us.
    return null;
  }

  // Web drives the OS controls through real `mediaSession` handlers, so there
  // is no unexplained jump to interpret there.
  if (Platform.OS === 'web') return null;
  // The monitor re-seeks continuously to follow a dragged marker; those jumps
  // are the preview working, not a lock-screen press.
  if (monitorActive) return null;
  if (!status.isLoaded || status.didJustFinish) return null;
  if (previous == null) return null;

  const delta = positionMs - previous;
  const offBy = Math.abs(Math.abs(delta) - NATIVE_LOCK_SCREEN_SKIP_MS);
  if (offBy > LOCK_SCREEN_SKIP_TOLERANCE_MS) return null;

  return { direction: delta > 0 ? 1 : -1, fromMs: previous };
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

  // A lock-screen press reaches us only as an unexplained jump (see the
  // NATIVE_LOCK_SCREEN_SKIP_MS notes above). Redirect it to the skip the user
  // actually configured, clamped to the active region.
  const lockScreenSkip = detectLockScreenSkip(status, newState.positionMs);
  if (lockScreenSkip && player) {
    const target = skipTargetMs(
      lockScreenSkip.direction,
      lockScreenSkip.fromMs,
    );
    // Nothing to correct when the native interval already lands where the
    // preference asks — a 10s setting inside an ample region.
    if (Math.abs(target - newState.positionMs) > 1) {
      const seeking = player;
      seekInternal(target).catch((err: unknown) => {
        reportSeekFailure(seeking, err);
      });
      // Publish the corrected position immediately so the UI never flashes the
      // native interval's landing spot on the way past.
      currentState = { ...newState, positionMs: target };
      notify(currentState);
      return;
    }
  }

  if (status.isLoaded && status.didJustFinish) {
    newState.status = 'paused';
    newState.positionMs = newState.durationMs;
  }

  // The monitor window, when active, overrides the A/B region: the preview
  // loops its own window and always rewinds (it ignores the loop toggle and
  // any per-loop count-in handler), so a marker drag previews cleanly without
  // touching the user's loop settings. With no complete A/B region, an armed
  // loop still repeats — the whole track, or A to the end when only A is set —
  // so looping works whether or not markers are placed.
  const monitor = monitorBounds();
  const region =
    monitor ?? regionBounds() ?? trackLoopBounds(newState.durationMs);
  if (
    status.isLoaded &&
    (status.playing || status.didJustFinish) &&
    region &&
    newState.positionMs >= region.b &&
    player &&
    !restoringTransport
  ) {
    if (!monitor && !loopEnabled) {
      // Loop disarmed: play the A..B region once, then stop at B. The next
      // play() restarts from A (see play()).
      stopPlayback(player);
      currentState = { ...newState, positionMs: region.b, status: 'paused' };
      notify(currentState);
      return;
    }

    // Loop armed (or monitor active): rewind to the start.
    markInternalSeek(region.a);
    const rewinding = player;
    rewinding.seekTo(msToSec(region.a)).catch((err: unknown) => {
      reportSeekFailure(rewinding, err);
    });

    if (!monitor && onLoopRestart) {
      // A per-loop count-in is registered: pause at A and hand off so the
      // caller can run the lead-in before resuming.
      stopPlayback(player);
      currentState = { ...newState, positionMs: region.a, status: 'paused' };
      notify(currentState);
      onLoopRestart();
      return;
    }

    // When the track reached its natural end, the player auto-pauses.
    // Restart it so the loop continues seamlessly.
    if (status.didJustFinish) {
      startPlayback(player);
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

// --- Lifecycle serialization -------------------------------------------------
// loadTrack and unloadTrack each run a chain of awaits over the same singleton
// (player, statusSubscription, currentTrackId). If two are allowed to interleave
// — a back-then-tap, a double-tapped track that stacks two player screens, or
// fast switching — two `createAudioPlayer` calls race: the module ends up
// pointing at one player while the other is orphaned (still loaded, its status
// subscription overwritten so it can never be removed, and unreachable by
// play/pause/stop), or a late-finishing unload nulls the reference to the live
// player. Both surface as two tracks overlapping with no way to stop them.
//
// To make that impossible, every load/unload is funnelled through a single
// promise chain so they run strictly one-at-a-time. The internal *Impl
// functions hold the real work and call each other directly (never the
// enqueued public wrappers, which would deadlock on the chain).
let lifecycleChain: Promise<unknown> = Promise.resolve();

function enqueueLifecycle<T>(op: () => Promise<T>): Promise<T> {
  // Run `op` after whatever is already queued, regardless of how the prior op
  // settled. Keep the chain alive with a settled promise so one failure can't
  // poison every later load/unload.
  const result = lifecycleChain.then(op, op);
  lifecycleChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function loadTrack(
  uri: string,
  trackId?: string,
  trackName?: string,
): Promise<void> {
  return enqueueLifecycle(() => loadTrackImpl(uri, trackId, trackName));
}

export function unloadTrack(): Promise<void> {
  return enqueueLifecycle(() => unloadTrackImpl());
}

async function loadTrackImpl(
  uri: string,
  trackId?: string,
  trackName?: string,
): Promise<void> {
  // Held outside the try so the catch can release a player that was created
  // but never published to `player` — a throw between the two (on native,
  // `setActiveForLockScreen` can fail on a permission or media-session
  // problem) would otherwise strand a fully loaded native player that
  // nothing can reach, and every retry would strand another.
  let created: AudioPlayer | null = null;
  try {
    await unloadTrackImpl();
    // Associate this load with its track so marker changes persist and the
    // saved set can be restored below. Without an id, markers stay in-memory.
    currentTrackId = trackId ?? null;

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
      interruptionMode: 'doNotMix',
    });

    const newPlayer = createAudioPlayer({ uri }, { updateInterval: 100 });
    created = newPlayer;
    // Seed the current volume so the very first frame plays at the persisted
    // level; setVolume() handles later live changes.
    newPlayer.volume = volume;
    // Register this player for lock screen / Now Playing controls on native so
    // the user can play, pause, skip, and seek from the lock screen and Control
    // Centre. Requires interruptionMode: 'doNotMix' (set above) per expo-audio
    // docs.
    //
    // The seek buttons run expo-audio's own fixed 10s seek; the status handler
    // catches the resulting jump and redirects it to the configured skip (see
    // NATIVE_LOCK_SCREEN_SKIP_MS). The buttons are still drawn with a "10"
    // glyph — iOS renders them from `preferredIntervals`, Android from
    // ICON_SKIP_*_10 — which nothing on the JS side can change.
    if (Platform.OS !== 'web') {
      newPlayer.setActiveForLockScreen(
        true,
        { title: trackName, artist: 'Refrain' },
        { showSeekForward: true, showSeekBackward: true },
      );
    }
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

    // On web, wire the OS media controls (media overlay, hardware keys) to the
    // transport. Native gets the equivalent from setActiveForLockScreen above;
    // web only has navigator.mediaSession, so without this the web build has no
    // media-key support. Best-effort and self-guarded — a no-op off-web.
    if (Platform.OS === 'web') {
      webMediaSession.setMetadata({ title: trackName, artist: 'Refrain' });
      // Each transport call can reject — they all reach `player.seekTo`, which
      // rejects against a released player. `void` discards the value but
      // attaches no rejection handler, so a media key pressed while the tab is
      // being backgrounded would raise an unhandled rejection out of a no-op.
      // A failed media-key press is not worth reporting; swallow it.
      webMediaSession.setHandlers({
        play: () => {
          void play().catch(() => undefined);
        },
        pause: () => {
          void pause().catch(() => undefined);
        },
        stop: () => {
          void stop().catch(() => undefined);
        },
        seekBackward: () => {
          void skipBack().catch(() => undefined);
        },
        seekForward: () => {
          void skipForward().catch(() => undefined);
        },
      });
      webMediaSession.setPlaybackState('paused');
    }

    // Restore saved markers last, after the load's reset so they aren't
    // clobbered. Silent and best-effort; no-op without a track id or saved row.
    if (currentTrackId != null) {
      await restoreActiveMarkers(currentTrackId);
    }
  } catch (err) {
    // Release a player that never became the live one, and drop any listener
    // that was attached to it, so a failed load leaves nothing behind.
    if (created && player !== created) {
      try {
        statusSubscription?.remove();
      } catch {
        // Best-effort teardown: report the original failure, not this one.
      }
      statusSubscription = null;
      try {
        created.remove();
      } catch {
        // Same.
      }
    }
    // The id was claimed before the load could fail. Leaving it set would let
    // a later marker edit schedule a save against a track that never loaded.
    currentTrackId = null;
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
  // Snapshot the player, as `stop` does. Everything below awaits, and a
  // teardown or a load of a different track can land in the gap: `player`
  // may be null by the time we get back (crash), or it may be a *different*
  // track's player (which would start that track at this one's marker A).
  // Comparing the snapshot against the live binding after each await is the
  // only way to tell — TypeScript keeps the narrowing across `await` for a
  // mutable module binding, so it cannot catch this.
  const target = player;
  if (!target) return;
  // Resume the audio graph on this user gesture so iOS's autoplay policy
  // can't leave the rerouted output silently suspended.
  if (webGainActive) webAudioGain.resume();

  // Explicitly (re)claim the audio session before playing. With
  // interruptionMode 'doNotMix', activating the session interrupts any other
  // app's audio (music, podcasts) — which is what the user expects when they
  // hit play. Crucially this also re-activates after stop()/unload deactivated
  // the session, so a play following a stop still grabs focus rather than
  // leaving another app's audio running underneath. Best-effort and native-
  // only: a failure here must never block playback. (On web, session focus is
  // managed by the browser.)
  if (Platform.OS !== 'web') {
    try {
      await setIsAudioActiveAsync(true);
    } catch {
      // best-effort: fall through to play regardless.
    }
  }

  if (player !== target) return;

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
      await seekInternal(region.a);
    }
  } else if (
    currentState.status === 'paused' &&
    currentState.positionMs >= currentState.durationMs &&
    currentState.durationMs > 0
  ) {
    await seekInternal(markerA ?? 0);
  }
  if (player !== target) return;
  startPlayback(target);
}

export async function pause(): Promise<void> {
  if (!player) return;
  stopPlayback(player);
}

export async function stop(): Promise<void> {
  const outgoing = player;
  if (!outgoing) return;
  // expo-audio has no stop(); emulate by pausing and rewinding. stop() runs
  // unserialized relative to load/unload, so the player can be removed
  // mid-call (e.g. tapping Stop then immediately navigating away) — pausing or
  // seeking a released player would reject. Best-effort so that race can never
  // surface as an unhandled rejection.
  try {
    outgoing.pause();
    markInternalSeek(markerA ?? 0);
    await outgoing.seekTo(msToSec(markerA ?? 0));
  } catch {
    // best-effort: the player may have been released mid-stop.
  }
  // Deactivate the audio session so iOS/Android restores focus to other apps
  // (music, podcasts, etc.). pause() intentionally leaves the session active so
  // a quick resume doesn't re-interrupt; stop() is a deliberate "done" action.
  if (Platform.OS !== 'web') {
    try {
      await setIsAudioActiveAsync(false);
    } catch {
      // best-effort: a failed deactivate must not reject; audio is paused.
    }
  } else {
    // Web has no audio session to release; mirror the native "done" intent by
    // clearing the OS overlay's active-playback state rather than leaving it
    // showing a (resumable) paused track.
    webMediaSession.setPlaybackState('none');
  }
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
  // Clamp B to the track. Saved markers are restored without knowing the new
  // track's length — a track re-imported over the same id from a shorter
  // file, or a duration corrected after the markers were saved, leaves B past
  // the end. The playhead can then never reach B, so the loop never rewinds
  // and `play()` finds the position neither before A nor at B and starts at
  // the very end, which finishes immediately: the Play button looks dead with
  // nothing explaining why. Clamping keeps the region reachable.
  const duration = currentState.durationMs;
  if (duration > 0 && markerB > duration) {
    if (markerA >= duration) return null;
    return { a: markerA, b: duration };
  }
  return { a: markerA, b: markerB };
}

/**
 * Fallback loop bounds when no complete A/B region exists: with the loop
 * armed, the track loops end-to-start — from A when only A is set, else from
 * the beginning — so the loop toggle works whether or not markers are placed.
 * Null when the loop is off or the duration is not yet known (a zero-duration
 * "region" would trap the playhead at 0).
 */
function trackLoopBounds(durationMs: number): { a: number; b: number } | null {
  if (!loopEnabled || durationMs <= 0) return null;
  return { a: markerA ?? 0, b: durationMs };
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
  await seekInternal(target);
}

/**
 * The range a skip may move within: the active A/B region when one is set,
 * otherwise the whole track. Shared by every skip path so the in-app buttons
 * and the lock screen confine the playhead identically.
 */
function skipBounds(): { lo: number; hi: number } {
  const bounds = regionBounds();
  return bounds
    ? { lo: bounds.a, hi: bounds.b }
    : { lo: 0, hi: currentState.durationMs };
}

/**
 * Where a skip in `direction` from `fromMs` should land under the current
 * preference: the region edge in `full` mode, otherwise the configured
 * interval away. Always clamped to `skipBounds()`.
 */
function skipTargetMs(direction: 1 | -1, fromMs: number): number {
  const { lo, hi } = skipBounds();
  const preference = readSkipPreference();
  const raw =
    preference.mode === 'full'
      ? direction < 0
        ? lo
        : hi
      : fromMs + direction * preference.seconds * 1000;
  return Math.max(lo, Math.min(raw, hi));
}

async function applySkip(direction: 1 | -1): Promise<void> {
  if (!player) return;
  await seekInternal(skipTargetMs(direction, currentState.positionMs));
}

/**
 * Skip backwards by the user's configured amount — or to the start of the
 * active region in `full` mode. Movement is clamped to the active A/B region
 * when one is set, otherwise to the full track, so skip works "within A and B"
 * with markers set and across the whole track otherwise.
 *
 * The engine reads the preference itself rather than taking a delta, so the
 * transport buttons and the lock screen cannot drift apart.
 */
export function skipBack(): Promise<void> {
  return applySkip(-1);
}

/** Skip forwards by the configured amount, or to the end of the active region. */
export function skipForward(): Promise<void> {
  return applySkip(1);
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
  const target = player;
  if (!target) return;
  const wasActive = monitorActive;
  const priorWindow = monitorWindow;
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
  try {
    await seekInternal(monitorWindow.start);
  } catch (err) {
    // The monitor flag is committed before the seek, so a rejection here
    // would otherwise leave the engine monitoring forever: `monitorBounds`
    // takes precedence over the A/B region, so the user's loop would be
    // silently replaced by a 4-second window until the track was reloaded.
    // Roll back to whatever was in force before this call.
    monitorActive = wasActive;
    monitorWindow = priorWindow;
    if (!wasActive) savedTransport = null;
    throw err;
  }
  if (player !== target) return;
  startPlayback(target);
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
    markInternalSeek(monitorWindow.start);
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

  const target = player;
  if (!target) return;

  // Restore the exact prior playhead, then the prior play/pause state. The
  // guard keeps the status handler off the transport until both have landed.
  restoringTransport = true;
  try {
    await seekInternal(saved ? saved.positionMs : 0);
    if (player !== target) return;
    if (saved?.isPlaying) {
      startPlayback(target);
    } else {
      stopPlayback(target);
    }
  } finally {
    restoringTransport = false;
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

async function unloadTrackImpl(): Promise<void> {
  // Persist any change still inside the debounce window for the outgoing track
  // before its id and markers are cleared, so a quick navigate-away doesn't
  // drop the last edit. Must run before currentTrackId is nulled below.
  flushMarkerSave();
  currentTrackId = null;
  // The next track starts with no movement history, so the first status update
  // it reports can't be read as a jump from the outgoing track's playhead.
  lastReportedPositionMs = null;
  pendingSeek = null;
  if (webGainActive) {
    webAudioGain.detach();
    webGainActive = false;
  }
  // Drop the web OS media controls so a removed track leaves no stale overlay
  // or dangling handlers. Self-guarded — a no-op off-web.
  if (Platform.OS === 'web') {
    webMediaSession.clear();
  }
  if (statusSubscription) {
    statusSubscription.remove();
    statusSubscription = null;
  }
  if (player) {
    const outgoing = player;
    // Clear the reference up front so the player is considered gone even if a
    // teardown step below throws — nothing should keep driving a half-removed
    // player.
    player = null;
    // Halt playback immediately. We must not rely on remove() alone to silence
    // audio, and the session-deactivate below can reject on a native hiccup —
    // pausing first guarantees the track stops even if a later step fails.
    try {
      outgoing.pause();
    } catch {
      // best-effort
    }
    if (Platform.OS !== 'web') {
      try {
        outgoing.clearLockScreenControls();
      } catch {
        // best-effort
      }
    }
    // Remove the player before the (awaitable, failable) session-deactivate so
    // a rejected/hung setIsAudioActiveAsync can never leave the player resident
    // and audible.
    try {
      outgoing.remove();
    } catch {
      // best-effort
    }
    if (Platform.OS !== 'web') {
      // Release audio focus so other apps can resume. Best-effort: if it fails,
      // the player is already paused and removed, so audio has stopped.
      try {
        await setIsAudioActiveAsync(false);
      } catch {
        // best-effort
      }
    }
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
/**
 * Route the current `volume` to whatever is actually producing sound. Shared
 * by `setVolume` and `loadPersistedVolume` so a level read from storage is
 * applied, not merely reported — `resumeContext` is false for the latter,
 * which does not run on a user gesture.
 */
function applyVolume(resumeContext: boolean): void {
  if (webGainActive) {
    webAudioGain.setGain(volume);
    if (resumeContext) webAudioGain.resume();
  } else if (player) {
    // Setting volume can throw if the player was released mid-flight; swallow
    // so a volume tweak can never surface as a playback error.
    try {
      player.volume = volume;
    } catch {
      // best-effort
    }
  }
}

export function setVolume(value: number): void {
  volume = clampVolume(value);
  // Resume on this user gesture so a drag can wake a context the autoplay
  // policy left suspended.
  applyVolume(true);
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
 *
 * Awaits `hydrateSettings()` first so the read never races the web store's
 * async IndexedDB hydration — on a cold web load the cache can be empty when
 * this runs, and a synchronous read would silently fall back to the default
 * (#163). Hydration is a resolved no-op on native, so this stays a single
 * cheap microtask there. Best-effort: falls back to the default on any
 * storage error.
 */
export async function loadPersistedVolume(): Promise<void> {
  try {
    await settingsStore.hydrateSettings();
    volume = clampVolume(
      settingsStore.getNumber(VOLUME_SETTING_KEY, DEFAULT_VOLUME),
    );
  } catch {
    volume = DEFAULT_VOLUME;
  }
  // Apply it, don't just report it. This can resolve after the player was
  // created — on a cold web load `hydrateSettings` is a real IndexedDB read,
  // and `loadTrack` runs alongside it — in which case the player was seeded
  // with the default and only this call corrects it. Without it the slider
  // shows the saved level while the track plays at full volume.
  applyVolume(false);
  currentState = { ...currentState, volume };
  notify(currentState);
}

/**
 * Write the current marker set for the loaded track to the store. Best-effort
 * and platform-agnostic: the native store is synchronous and the web store
 * returns a promise, so the call goes through `settle` and its rejection is
 * swallowed — a failed persist must never surface as a playback error. No-op
 * when no track id is associated with the load.
 */
function writeActiveMarkers(): void {
  const trackId = currentTrackId;
  if (trackId == null) return;
  const snapshot: ActiveMarkers = { markerA, markerB, loopEnabled };
  void settle(() => markerStore.setActiveMarkers(trackId, snapshot)).catch(
    () => {
      // Persistence is best-effort; swallow write failures on both platforms.
    },
  );
}

/**
 * Queue a debounced persist of the active markers. Each marker change resets
 * the timer, so a burst of changes (e.g. a drag) collapses into a single write
 * carrying the final value. No-op when the track has no id.
 */
function scheduleMarkerSave(): void {
  if (currentTrackId == null) return;
  if (markerSaveTimer) clearTimeout(markerSaveTimer);
  markerSaveTimer = setTimeout(() => {
    markerSaveTimer = null;
    writeActiveMarkers();
  }, MARKER_SAVE_DEBOUNCE_MS);
}

/**
 * Flush any queued marker save immediately. Called before the loaded track is
 * torn down so a change made within the debounce window is persisted for the
 * outgoing track rather than lost (or clobbered by the unload reset).
 */
function flushMarkerSave(): void {
  if (markerSaveTimer) {
    clearTimeout(markerSaveTimer);
    markerSaveTimer = null;
    writeActiveMarkers();
  }
}

/**
 * Restore the persisted markers for the loaded track, overriding the
 * post-load defaults (empty markers, loop armed). Silent: it mutates the
 * engine's marker state directly — not via the public setters — so it neither
 * re-triggers a save nor surfaces UI churn beyond the single state notify.
 * A track with no saved row is left empty (current behaviour). Best-effort:
 * a read failure leaves the defaults in place.
 */
async function restoreActiveMarkers(trackId: string): Promise<void> {
  try {
    const saved = await settle(() => markerStore.getActiveMarkers(trackId));
    if (!saved) return;
    markerA = saved.markerA;
    markerB = saved.markerB;
    loopEnabled = saved.loopEnabled;
    currentState = { ...currentState, markerA, markerB, loopEnabled };
    notify(currentState);
  } catch {
    // Best-effort: a failed restore leaves the track with empty markers.
  }
}

export function setMarkerA(positionMs: number): void {
  markerA = positionMs;
  if (markerB != null && positionMs >= markerB) {
    markerB = null;
  }
  currentState = { ...currentState, markerA, markerB };
  notify(currentState);
  scheduleMarkerSave();
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
  scheduleMarkerSave();
  return true;
}

export function clearMarkers(): void {
  markerA = null;
  markerB = null;
  currentState = { ...currentState, markerA: null, markerB: null };
  notify(currentState);
  scheduleMarkerSave();
}

/** Clear only the B (loop end) marker, leaving A in place so it can be
 * re-placed without redoing A. */
export function clearMarkerB(): void {
  markerB = null;
  currentState = { ...currentState, markerB: null };
  notify(currentState);
  scheduleMarkerSave();
}

/**
 * Which marker a {@link commitMarkerPlacement} call is reporting. `'A'` covers
 * any commit that moved A — including a segment load, which sets both markers
 * but should park the playhead once, at the region start.
 */
export type MarkerCommit = 'A' | 'B';

/**
 * Park the playhead at the loop start once a marker edit is committed, so the
 * region you just defined is the region you hear next.
 *
 * Committing A always moves the playhead to A: placing A declares where the
 * phrase starts, and the point of a practice looper is hearing that
 * immediately. Committing B only moves it when the new region leaves the
 * playhead stranded outside `[A, B)` — placing B ahead of a playhead that is
 * still inside the region lets it run on and loop naturally, instead of
 * yanking back to A mid-phrase.
 *
 * Deliberately never starts or stops playback: playing keeps playing from A,
 * paused stays paused at A, ready for the next play().
 *
 * This is a *commit*-time operation. `setMarkerA`/`setMarkerB` are called
 * throughout a drag (~20/sec), and seeking at that cadence is the scrubbing
 * that `updateMonitor` goes out of its way to avoid on web — so the move lives
 * here, called once on release, rather than inside the setters.
 */
export async function commitMarkerPlacement(
  placed: MarkerCommit,
): Promise<void> {
  if (!player || markerA == null) return;

  // While a snippet preview is running, the live playhead is somewhere inside
  // the preview window — the position that actually matters is the one
  // stopMonitor is about to restore.
  const settledPosition =
    monitorActive && savedTransport
      ? savedTransport.positionMs
      : currentState.positionMs;

  if (placed === 'B') {
    const region = regionBounds();
    if (!region) return;
    if (settledPosition >= region.a && settledPosition < region.b) return;
  }

  if (monitorActive && savedTransport) {
    // Redirect the preview's pending restore rather than racing its seek: the
    // caller fires this before tearing the monitor down, so stopMonitor lands
    // the playhead at A in a single move and still applies the prior
    // play/pause state on top. Seeking here instead would leave two seeks in
    // flight with the restore free to win.
    savedTransport = { ...savedTransport, positionMs: markerA };
    return;
  }

  await seekTo(markerA);
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
  scheduleMarkerSave();
}

export function subscribe(cb: PlaybackListener): () => void {
  listeners.add(cb);
  // Replay the current state through the same isolation as a broadcast: this
  // runs inside the subscriber's mount effect, where a throw would fail the
  // component rather than just its own state sync.
  emit(cb, currentState);
  return () => {
    listeners.delete(cb);
  };
}

export function getState(): PlaybackState {
  return currentState;
}

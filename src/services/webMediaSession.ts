/**
 * Web Media Session integration for OS-level media controls.
 *
 * On native, lock-screen / Now Playing controls come from
 * `AudioPlayer.setActiveForLockScreen`. On web there is no such call — the
 * browser exposes the equivalent through `navigator.mediaSession`, which drives
 * the OS media overlay, hardware media keys, and headset buttons. Without it,
 * the web build has no media-key support at all.
 *
 * Web-only and pure (no React). Heavily guarded: every call is wrapped so a
 * missing API (older browsers, React Native's `navigator`) degrades to a no-op
 * instead of throwing. Setting an action handler can throw for actions a
 * browser doesn't support, so each is set independently.
 */

export type MediaSessionPlaybackState = 'none' | 'paused' | 'playing';

export interface MediaSessionHandlers {
  play: () => void;
  pause: () => void;
  stop: () => void;
}

interface MediaSessionLike {
  metadata: unknown;
  playbackState: MediaSessionPlaybackState;
  setActionHandler: (action: string, handler: (() => void) | null) => void;
}

type MediaMetadataCtor = new (init: {
  title?: string;
  artist?: string;
  album?: string;
}) => unknown;

function getMediaSession(): MediaSessionLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as unknown as { mediaSession?: MediaSessionLike };
  const session = nav.mediaSession;
  if (!session || typeof session.setActionHandler !== 'function') return null;
  return session;
}

function getMediaMetadataCtor(): MediaMetadataCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as unknown as { MediaMetadata?: MediaMetadataCtor };
  return typeof g.MediaMetadata === 'function' ? g.MediaMetadata : null;
}

/** True when the browser exposes the Media Session API we rely on. */
export function isSupported(): boolean {
  return getMediaSession() !== null;
}

/**
 * Publish the now-playing metadata shown in the OS media overlay. No-op when
 * the API or the `MediaMetadata` constructor is unavailable.
 */
export function setMetadata(metadata: {
  title?: string;
  artist?: string;
}): void {
  const session = getMediaSession();
  if (!session) return;
  const Ctor = getMediaMetadataCtor();
  if (!Ctor) return;
  try {
    session.metadata = new Ctor({
      title: metadata.title ?? 'Untitled',
      artist: metadata.artist ?? 'Refrain',
    });
  } catch {
    // best-effort
  }
}

/**
 * Wire the OS media controls (overlay buttons, hardware keys) to the engine's
 * transport. Each handler is set independently so one unsupported action can't
 * stop the others from registering. No-op when unsupported.
 */
export function setHandlers(handlers: MediaSessionHandlers): void {
  const session = getMediaSession();
  if (!session) return;
  const map: [string, () => void][] = [
    ['play', handlers.play],
    ['pause', handlers.pause],
    ['stop', handlers.stop],
  ];
  for (const [action, handler] of map) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // The browser doesn't support this action — skip it.
    }
  }
}

/** Reflect the current transport state in the OS overlay. No-op when unsupported. */
export function setPlaybackState(state: MediaSessionPlaybackState): void {
  const session = getMediaSession();
  if (!session) return;
  try {
    session.playbackState = state;
  } catch {
    // best-effort
  }
}

/**
 * Tear down the session: clear metadata, reset playback state, and unregister
 * every action handler so a removed track can't leave stale controls behind.
 */
export function clear(): void {
  const session = getMediaSession();
  if (!session) return;
  try {
    session.metadata = null;
  } catch {
    // best-effort
  }
  setPlaybackState('none');
  for (const action of ['play', 'pause', 'stop']) {
    try {
      session.setActionHandler(action, null);
    } catch {
      // best-effort
    }
  }
}

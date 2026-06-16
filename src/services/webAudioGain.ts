/**
 * Web Audio gain routing for true volume attenuation on iOS Safari.
 *
 * iOS WebKit (and every iOS browser) ignores programmatic
 * `HTMLMediaElement.volume`, so `expo-audio`'s web volume path silently no-ops
 * there. Routing the media element through a `MediaElementAudioSourceNode ->
 * GainNode -> destination` graph lets us attenuate output via the gain node
 * instead, which WebKit honours.
 *
 * Web-only and pure (no React). Heavily guarded: every Web Audio call is
 * wrapped so a missing API or an expo-audio internal change degrades to the
 * caller's fallback instead of breaking playback. One shared `AudioContext`
 * is reused across tracks; each track gets its own source + gain graph
 * (a media element can only be sourced once, so a fresh element per track is
 * required — which is exactly what loading a new `expo-audio` player provides).
 */

type AudioContextCtor = new () => AudioContext;

interface Graph {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

let context: AudioContext | null = null;
let graph: Graph | null = null;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * True when the browser exposes the Web Audio APIs needed to attenuate a
 * media element via a gain node. Capability check only — it does not prove a
 * specific element can be sourced (that is what `attach` returns).
 */
export function isWebAudioGainSupported(): boolean {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return false;
  return (
    typeof MediaElementAudioSourceNode !== 'undefined' &&
    typeof GainNode !== 'undefined'
  );
}

function ensureContext(): AudioContext | null {
  if (context) return context;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

/**
 * Build a `source -> gain -> destination` graph for `media`, replacing any
 * existing graph. Returns true on success, false (with cleanup) if Web Audio
 * is unavailable or the element cannot be sourced — callers then fall back to
 * the native volume path.
 */
export function attach(media: HTMLMediaElement): boolean {
  if (!isWebAudioGainSupported()) return false;

  // Drop any previous graph first so we never leak a source node.
  detach();

  const ctx = ensureContext();
  if (!ctx) return false;

  try {
    // Creating a second source for the same element throws; callers pass a
    // fresh element per track, so this is the first (and only) source for it.
    const source = ctx.createMediaElementSource(media);
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    graph = { source, gain };
    return true;
  } catch {
    graph = null;
    return false;
  }
}

/** Set the attenuation (0..1) on the current graph. No-op when inactive. */
export function setGain(value: number): void {
  if (!graph) return;
  try {
    graph.gain.gain.value = clamp01(value);
  } catch {
    // A detached/closed node can throw; a volume tweak must never surface.
  }
}

/**
 * Resume the shared context if the autoplay policy left it suspended. Call on
 * a user gesture (play / volume drag) so rerouting never causes silent
 * playback. Best-effort — failures are swallowed.
 */
export function resume(): void {
  if (!context) return;
  if (context.state !== 'suspended') return;
  void context.resume().catch(() => undefined);
}

/** Disconnect and drop the current graph. The shared context is kept. */
export function detach(): void {
  if (!graph) return;
  try {
    graph.source.disconnect();
  } catch {
    // Already disconnected — ignore.
  }
  try {
    graph.gain.disconnect();
  } catch {
    // Already disconnected — ignore.
  }
  graph = null;
}

/** True when a graph is currently routing a media element. */
export function isActive(): boolean {
  return graph !== null;
}

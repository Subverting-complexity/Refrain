/**
 * The arithmetic behind the audio engine's loop region, monitor window and
 * skip targets.
 *
 * Every function here is a pure function of its arguments. Nothing reads
 * module state, touches storage, or imports expo-audio — which is the point of
 * the module existing. In `audioEngine.ts` this same arithmetic read `markerA`,
 * `markerB`, `monitorWindow` and `currentState.durationMs` straight off module
 * scope, so the only way to exercise it was to drive the whole engine through
 * the expo-audio mock and infer the maths from what the player was asked to do.
 * Taking the inputs as parameters makes each rule directly testable, and the
 * rules are worth testing directly: most of them exist because of a specific
 * way the playhead once got stuck.
 *
 * `audioEngine.ts` keeps the state and the side effects and calls in here for
 * the decisions.
 */

import { SkipPreference } from './skipIntervalStore';

/**
 * A loop region in milliseconds: play from `a`, and act when the playhead
 * reaches `b`. Shared by the A/B region, the whole-track fallback and the
 * monitor window so the status handler can treat all three the same way.
 */
export interface LoopBounds {
  a: number;
  b: number;
}

/** The range a seek or skip may move within, in milliseconds. */
export interface SkipRange {
  lo: number;
  hi: number;
}

/** The rolling monitor's preview window in milliseconds. */
export interface MonitorWindow {
  start: number;
  end: number;
}

/**
 * Half-width of the marker-drag preview window: two seconds either side of the
 * marker being dragged. Lives here rather than in `audioEngine.ts` because
 * {@link computeMonitorWindow} is the only thing that reads it.
 */
export const MONITOR_HALF_WINDOW_MS = 2000;

/**
 * The active A/B region, or null when both markers aren't set (or A is not
 * before B). When set, seeks and skips are confined to [a, b] so the playhead
 * stays inside the region — independent of whether the loop is armed (the loop
 * toggle only decides whether reaching B rewinds or stops).
 *
 * @param durationMs the track length, or 0 when it is not yet known
 */
export function regionBounds({
  markerA,
  markerB,
  durationMs,
}: {
  markerA: number | null;
  markerB: number | null;
  durationMs: number;
}): LoopBounds | null {
  if (markerA == null || markerB == null) return null;
  if (markerA >= markerB) return null;
  // Clamp B to the track. Saved markers are restored without knowing the new
  // track's length — a track re-imported over the same id from a shorter
  // file, or a duration corrected after the markers were saved, leaves B past
  // the end. The playhead can then never reach B, so the loop never rewinds
  // and `play()` finds the position neither before A nor at B and starts at
  // the very end, which finishes immediately: the Play button looks dead with
  // nothing explaining why. Clamping keeps the region reachable.
  if (durationMs > 0 && markerB > durationMs) {
    if (markerA >= durationMs) return null;
    return { a: markerA, b: durationMs };
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
export function trackLoopBounds({
  loopEnabled,
  markerA,
  durationMs,
}: {
  loopEnabled: boolean;
  markerA: number | null;
  durationMs: number;
}): LoopBounds | null {
  if (!loopEnabled || durationMs <= 0) return null;
  return { a: usableMarkerA({ markerA, durationMs }), b: durationMs };
}

/**
 * Marker A if it lands inside the track, else the start.
 *
 * Markers are restored without knowing the new track's length, so a track
 * re-imported from a shorter file can leave A past the end. Used as a loop
 * start it would give an inverted region — the playhead is always past `b`,
 * so every status update would rewind to a point beyond the end, finish
 * immediately, and rewind again, spinning at the update rate while reporting
 * a position past the end of the track. A marker that cannot be reached is
 * not a loop start; fall back to the beginning.
 */
export function usableMarkerA({
  markerA,
  durationMs,
}: {
  markerA: number | null;
  durationMs: number;
}): number {
  if (markerA == null) return 0;
  if (durationMs > 0 && markerA >= durationMs) return 0;
  return markerA;
}

/**
 * What the markers should be once the track's real length is known, and
 * whether that differs from what they are now.
 *
 * Markers are restored during load, before any duration has been reported, so
 * a track re-imported from a shorter file (or one whose estimated duration is
 * later corrected downward) can carry markers past its end. Reconciling the
 * moment the duration arrives keeps three things honest at once: the loop
 * bounds, what the waveform and time readouts show, and what the debounced
 * save writes back. Doing it only in {@link regionBounds} fixed the looping
 * while leaving the reader looking at a B flag beyond the end of their own
 * waveform, and saved that value again.
 *
 * A B past the end is dropped rather than pinned to the end: a loop end the
 * reader never chose is a worse guess than no loop end. An A past the end goes
 * with it, since it can no longer start anything.
 *
 * This returns the new markers rather than assigning them, which is the one
 * shape change made while extracting this group. In `audioEngine.ts` it wrote
 * to module scope and queued a save, so it was never arithmetic; the caller
 * now applies the result and queues the save, and the rule itself is testable.
 * `changed` is what tells the caller a save is owed — it is not the same
 * question as whether the returned markers are null, because both were already
 * null in the common case.
 */
export function reconcileMarkersToDuration({
  markerA,
  markerB,
  durationMs,
}: {
  markerA: number | null;
  markerB: number | null;
  durationMs: number;
}): { markerA: number | null; markerB: number | null; changed: boolean } {
  if (durationMs <= 0) return { markerA, markerB, changed: false };

  let nextA = markerA;
  let nextB = markerB;
  let changed = false;

  if (nextB != null && nextB > durationMs) {
    nextB = null;
    changed = true;
  }
  if (nextA != null && nextA >= durationMs) {
    nextA = null;
    changed = true;
  }

  return { markerA: nextA, markerB: nextB, changed };
}

/**
 * The active monitor window expressed as loop bounds, or null when the monitor
 * is idle. Shares the {@link LoopBounds} shape with {@link regionBounds} so the
 * status handler can treat it as a drop-in loop region that takes precedence
 * over the A/B markers while a preview is running.
 */
export function monitorBounds({
  monitorActive,
  monitorWindow,
}: {
  monitorActive: boolean;
  monitorWindow: MonitorWindow | null;
}): LoopBounds | null {
  if (!monitorActive || monitorWindow == null) return null;
  return { a: monitorWindow.start, b: monitorWindow.end };
}

/**
 * Build the preview window `[center-2000, center+2000]` clamped to the track.
 * The upper bound falls back to the raw window end when the duration isn't
 * known yet (e.g. the very first preview before a status update lands), so the
 * window is always an ordered range.
 *
 * Ordered, but not necessarily non-empty, which the comment inherited from
 * `audioEngine.ts` used to claim: a centre past the end of a very short track
 * clamps both ends onto the duration and yields a zero-length window. That
 * would loop the playhead on the spot if it reached {@link monitorBounds}, so
 * it is worth knowing rather than being told the opposite. Reaching it means
 * starting a preview centred beyond the track, which the drag handles do not
 * currently allow.
 */
export function computeMonitorWindow({
  centerMs,
  durationMs,
}: {
  centerMs: number;
  durationMs: number;
}): MonitorWindow {
  const upper = durationMs > 0 ? durationMs : centerMs + MONITOR_HALF_WINDOW_MS;
  const start = Math.max(0, Math.min(centerMs - MONITOR_HALF_WINDOW_MS, upper));
  const end = Math.max(
    start,
    Math.min(centerMs + MONITOR_HALF_WINDOW_MS, upper),
  );
  return { start, end };
}

/**
 * The range a skip may move within: the active A/B region when one is set,
 * otherwise the whole track. Shared by every skip path so the in-app buttons
 * and the lock screen confine the playhead identically.
 */
export function skipBounds({
  markerA,
  markerB,
  durationMs,
}: {
  markerA: number | null;
  markerB: number | null;
  durationMs: number;
}): SkipRange {
  const bounds = regionBounds({ markerA, markerB, durationMs });
  return bounds ? { lo: bounds.a, hi: bounds.b } : { lo: 0, hi: durationMs };
}

/**
 * Where a skip in `direction` from `fromMs` should land under the given
 * preference: the region edge in `full` mode, otherwise the configured
 * interval away. Always clamped to {@link skipBounds}.
 *
 * The preference arrives as a parameter rather than being read from the
 * settings store, so this stays arithmetic instead of dragging storage — and
 * its own failure handling — in with it. `audioEngine.ts` still owns the
 * best-effort read.
 */
export function skipTargetMs({
  direction,
  fromMs,
  preference,
  markerA,
  markerB,
  durationMs,
}: {
  direction: 1 | -1;
  fromMs: number;
  preference: SkipPreference;
  markerA: number | null;
  markerB: number | null;
  durationMs: number;
}): number {
  const { lo, hi } = skipBounds({ markerA, markerB, durationMs });
  const raw =
    preference.mode === 'full'
      ? direction < 0
        ? lo
        : hi
      : fromMs + direction * preference.seconds * 1000;
  return Math.max(lo, Math.min(raw, hi));
}

/**
 * What the status handler should do about the playhead having reached the end
 * of the active loop region.
 *
 * - `none` — nothing to do; publish the status as it is.
 * - `stop-at-b` — the loop is disarmed, so play the region once and stop at B.
 * - `hand-off-to-count-in` — rewind to A, pause, and let the registered
 *   count-in handler decide when to resume.
 * - `rewind` — rewind to A while the player keeps running.
 * - `rewind-and-resume` — rewind to A and press play again. Only the wrap at
 *   the natural end of the track needs this: the player has auto-paused there.
 */
export type LoopBoundaryAction =
  | 'none'
  | 'stop-at-b'
  | 'hand-off-to-count-in'
  | 'rewind'
  | 'rewind-and-resume';

/**
 * The decision at the loop boundary, as a pure function of the status and the
 * engine's current settings.
 *
 * This is the highest-branching decision in the engine, and it was previously
 * spread through `onPlaybackStatusUpdate` interleaved with the seeks and
 * notifications it triggers, where the only way to check a case was to drive
 * the whole player. The effects stay in the handler; what comes out here is
 * the choice between them, which is a question about values and can be
 * covered as a table.
 *
 * The monitor overrides everything below it: a preview always rewinds,
 * ignoring both the loop toggle and any count-in handler, so a marker drag
 * previews cleanly without touching the user's loop settings.
 */
export function loopBoundaryAction({
  isLoaded,
  playing,
  didJustFinish,
  positionMs,
  region,
  monitorOverridesRegion,
  loopEnabled,
  hasCountInHandler,
  hasPlayer,
  restoringTransport,
}: {
  isLoaded: boolean;
  playing: boolean;
  didJustFinish: boolean;
  positionMs: number;
  region: LoopBounds | null;
  /**
   * Whether a monitor preview is overriding the A/B region, which is not the
   * same question as the engine's own `monitorActive` flag: a preview only
   * overrides once it also has a window to loop. Named apart from that flag on
   * purpose, because passing it here would compile, read correctly, and change
   * behaviour in the gap between arming a monitor and computing its window.
   */
  monitorOverridesRegion: boolean;
  loopEnabled: boolean;
  hasCountInHandler: boolean;
  hasPlayer: boolean;
  /**
   * True while the monitor's restore seek is in flight. The monitor window is
   * already cleared by then, so without this the handler would fall through to
   * the A/B region and, if the preview sat at or past marker B, issue its own
   * rewind — racing the restore and stealing the playhead the user had before
   * the drag.
   */
  restoringTransport: boolean;
}): LoopBoundaryAction {
  const atBoundary =
    isLoaded &&
    (playing || didJustFinish) &&
    region != null &&
    positionMs >= region.b &&
    hasPlayer &&
    !restoringTransport;
  if (!atBoundary) return 'none';

  // Order matters between these two. A loop the reader has disarmed stops at
  // B even when a count-in is registered: the count-in is how a loop restarts,
  // not a reason to restart one that is switched off. Swapping them would
  // repeat the section forever with the loop toggle ignored.
  if (!monitorOverridesRegion && !loopEnabled) return 'stop-at-b';
  if (!monitorOverridesRegion && hasCountInHandler)
    return 'hand-off-to-count-in';
  return didJustFinish ? 'rewind-and-resume' : 'rewind';
}

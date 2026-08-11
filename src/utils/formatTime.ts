const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

const pad2 = (value: number): string => value.toString().padStart(2, '0');

/**
 * Split a whole-second count into a clock triple. Minutes are taken modulo 60
 * so the hours component carries the overflow instead of the minutes growing
 * unbounded (a 75-minute track is `1:15:00`, not `75:00`).
 */
function splitClock(totalSeconds: number): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  return {
    hours: Math.floor(totalSeconds / SECONDS_PER_HOUR),
    minutes: Math.floor(totalSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE,
    seconds: totalSeconds % SECONDS_PER_MINUTE,
  };
}

/**
 * Format a duration in milliseconds as `m:ss`, widening to `h:mm:ss` from one
 * hour up so long imports (DJ sets, lectures, whole albums as one file) read as
 * a clock time instead of an unbounded minutes count.
 *
 * Invalid input (NaN, negative, or non-finite) is clamped to `0:00`,
 * since playback positions and track durations are never negative.
 */
export function formatDuration(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const { hours, minutes, seconds } = splitClock(Math.floor(safeMs / 1000));
  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    : `${minutes}:${pad2(seconds)}`;
}

/**
 * Format a duration in milliseconds as `m:ss.t` (tenths of a second), widening
 * to `h:mm:ss.t` past an hour for the same reason as {@link formatDuration} —
 * markers in a long track sit well past the 59:59 mark.
 * Used in the marker time editor where 100 ms precision is shown.
 */
export function formatDurationTenths(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms >= 0 ? ms : 0;
  const totalTenths = Math.round(safeMs / 100);
  const tenths = totalTenths % 10;
  const { hours, minutes, seconds } = splitClock(Math.floor(totalTenths / 10));
  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}.${tenths}`
    : `${minutes}:${pad2(seconds)}.${tenths}`;
}

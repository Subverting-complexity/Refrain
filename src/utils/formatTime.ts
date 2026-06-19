/**
 * Format a duration in milliseconds as `m:ss`.
 *
 * Invalid input (NaN, negative, or non-finite) is clamped to `0:00`,
 * since playback positions and track durations are never negative.
 */
export function formatDuration(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

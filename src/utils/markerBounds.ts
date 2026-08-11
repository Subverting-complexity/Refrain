/**
 * The engine holds one invariant over the A/B region: `markerA < markerB`.
 * `audioEngine.setMarkerB` rejects a B at or before A, and `setMarkerA` drops B
 * outright when A is moved to or past it — so every control that moves a marker
 * has to keep the placement legal itself, or it either loses B silently or has
 * its write rejected while its own display keeps moving.
 *
 * These helpers are that single source of truth, shared by the waveform drag
 * handles and the marker time editor so both stop at the same boundary.
 */

/** Smallest gap the `markerA < markerB` invariant allows between the markers. */
export const MIN_MARKER_GAP_MS = 1;

export interface MarkerBounds {
  minMs: number;
  maxMs: number;
}

/**
 * The range one marker may be moved within, given its sibling and the track
 * length. A is capped just before B, B floored just after A; the sibling is
 * ignored when unset, leaving the full track. `minMs` never exceeds `maxMs`,
 * so a degenerate track (unknown duration, or a sibling past the end) collapses
 * to a single legal position rather than an empty range.
 */
export function markerBounds(
  marker: 'A' | 'B',
  markerA: number | null,
  markerB: number | null,
  durationMs: number,
): MarkerBounds {
  const trackEnd = Math.max(0, durationMs);

  if (marker === 'A') {
    const maxMs =
      markerB != null ? Math.max(0, markerB - MIN_MARKER_GAP_MS) : trackEnd;
    return { minMs: 0, maxMs };
  }

  const minMs =
    markerA != null ? Math.min(markerA + MIN_MARKER_GAP_MS, trackEnd) : 0;
  return { minMs, maxMs: trackEnd };
}

/** Clamp `ms` into `bounds`. */
export function clampToBounds(ms: number, bounds: MarkerBounds): number {
  return Math.max(bounds.minMs, Math.min(ms, bounds.maxMs));
}

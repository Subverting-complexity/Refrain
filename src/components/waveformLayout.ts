import { spacing } from '../theme';

/**
 * Geometry shared by the waveform surface, its presentational pieces, and the
 * gesture hook that hit-tests against it. One module so the hit zones and the
 * drawn handles can never drift apart.
 */

/** Shortest the waveform surface ever gets, and its height without a viewport. */
export const DEFAULT_WAVEFORM_HEIGHT = 180;

/** Tallest it gets, so it does not run away on a tablet. */
const MAX_WAVEFORM_HEIGHT = 340;

/** Share of the viewport height the surface aims for between those bounds. */
const WAVEFORM_HEIGHT_RATIO = 0.28;

/**
 * The surface height for a given viewport: scaled so it fills the space
 * instead of sitting small and boxed-in, with sane phone bounds either side.
 *
 * Rounded and clamped, which is what lets the component that reads the
 * viewport absorb a metric change rather than pass it on: Android reports one
 * for every inset and soft-keyboard event, and nearly all of them resolve to
 * the height already in use.
 */
export function waveformHeightForViewport(viewportHeight: number): number {
  return Math.round(
    Math.min(
      MAX_WAVEFORM_HEIGHT,
      Math.max(DEFAULT_WAVEFORM_HEIGHT, viewportHeight * WAVEFORM_HEIGHT_RATIO),
    ),
  );
}

// The grab zone around a marker. Generous so a fingertip can land the thin
// line, and matched to the visible handle width so the handle reads as the
// thing you grab.
export const MARKER_HIT_ZONE_PX = 24;
export const HANDLE_WIDTH = 24;
export const HANDLE_HEIGHT = 20;

// Vertical band reserved at the top (for A's flag) and bottom (for B's flag),
// keeping the bars/cursor between them.
export const HANDLE_ZONE = HANDLE_HEIGHT + 6;

/**
 * Inset on each side of the track. The bars are laid out inside it and touches
 * are mapped relative to it, so both share one origin.
 */
export const HORIZONTAL_PADDING = spacing.md;

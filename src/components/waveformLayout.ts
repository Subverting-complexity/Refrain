import { spacing } from '../theme';

/**
 * Geometry shared by the waveform surface, its presentational pieces, and the
 * gesture hook that hit-tests against it. One module so the hit zones and the
 * drawn handles can never drift apart.
 */

/** Overall height of the waveform surface when the caller doesn't set one. */
export const DEFAULT_WAVEFORM_HEIGHT = 180;

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

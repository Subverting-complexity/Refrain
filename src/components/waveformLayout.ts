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

/**
 * The two bar-grid snaps below exist to stop the 200 amplitude bars being
 * re-rendered for a movement that cannot change any of them.
 *
 * `WaveformBars` colours a bar by comparing the bar's centre — `(i + 0.5) / n`
 * — against the playhead and the region edges. Those centres are the only
 * positions at which a bar can change tier, so a playhead that advances a
 * tenth of a bar, or a marker dragged a pixel, produces an identical picture
 * from a different number. Feeding the raw number to a memoised component
 * therefore re-renders it, and every one of its 200 children, for nothing.
 *
 * Snapping to the grid makes "the picture has not changed" and "the prop has
 * not changed" the same statement, so the memo holds. Which direction to snap
 * depends on the comparison the value feeds, hence two functions: rounding to
 * the nearest centre would move a boundary that sits exactly on one.
 */

/** Rebuild a grid position from an index, exactly as `WaveformBars` does. */
function centreFraction(index: number, barCount: number): number {
  return (index + 0.5) / barCount;
}

/**
 * The first guess at which bar an edge falls in. Correct to within one bar,
 * and corrected below: this arithmetic and the comparison `WaveformBars`
 * makes are not the same arithmetic, so at a centre that sits exactly on the
 * edge the two can round opposite ways. Rather than reason about which, the
 * snaps step from here using the comparison itself.
 */
function guessIndex(fraction: number, barCount: number): number {
  return fraction * barCount - 0.5;
}

/**
 * Snap a position for a predicate that includes a bar when its centre is at or
 * **before** the position — the played fill, and the region's upper (B) edge.
 *
 * Returns the highest bar centre at or below `fraction`, built with the same
 * expression `WaveformBars` uses for a centre, so the comparison `centre <=
 * snapped` admits exactly the bars `centre <= fraction` did. The index is
 * clamped to one below the first bar, so a position before every centre snaps
 * to a single value rather than running away, and to the last bar, so any
 * overshoot past the end of the track does the same.
 */
export function snapDownToBarGrid(fraction: number, barCount: number): number {
  if (barCount <= 0 || !Number.isFinite(fraction)) return fraction;
  let index = Math.max(
    -1,
    Math.min(barCount - 1, Math.floor(guessIndex(fraction, barCount))),
  );
  while (index >= 0 && centreFraction(index, barCount) > fraction) index -= 1;
  while (
    index + 1 < barCount &&
    centreFraction(index + 1, barCount) <= fraction
  ) {
    index += 1;
  }
  return centreFraction(index, barCount);
}

/**
 * Snap a position for a predicate that includes a bar when its centre is at or
 * **after** the position — the region's lower (A) edge.
 *
 * The mirror of {@link snapDownToBarGrid}: the lowest bar centre at or above
 * `fraction`, clamped to the first bar and to one past the last.
 */
export function snapUpToBarGrid(fraction: number, barCount: number): number {
  if (barCount <= 0 || !Number.isFinite(fraction)) return fraction;
  let index = Math.max(
    0,
    Math.min(barCount, Math.ceil(guessIndex(fraction, barCount))),
  );
  while (index > 0 && centreFraction(index - 1, barCount) >= fraction) {
    index -= 1;
  }
  while (index < barCount && centreFraction(index, barCount) < fraction) {
    index += 1;
  }
  return centreFraction(index, barCount);
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

import { spacing } from '../theme';
import { WaveformPeaks } from '../types';

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
 *
 * All four are worklets. The snap is applied on the UI thread, where the
 * playhead lives, so that only a movement which actually crosses a bar centre
 * crosses the thread boundary and re-renders the bars; see
 * `useUiDerivedNumber`. Plain JavaScript callers and the tests are unaffected.
 */

/** Rebuild a grid position from an index, exactly as `WaveformBars` does. */
function centreFraction(index: number, barCount: number): number {
  'worklet';
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
  'worklet';
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
  'worklet';
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
  'worklet';
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

/**
 * Narrowest a bar plus its gap may be, in dp.
 *
 * The analyser produces 200 buckets, which is a good resolution to *store* and
 * far more than a phone can *draw*: on a 360dp screen the track is about 280dp
 * wide, so 200 bars leaves 1.4dp per bar, of which 1dp is the gap either side.
 * The bar itself is then 0.4dp — under half a physical pixel on a 3x screen.
 * Android rounds each view's bounds to whole pixels, so those bars land as a
 * ragged 1px comb rather than a waveform, and the per-bar shading the played
 * tier grades across is invisible at that width.
 *
 * Three dp gives a 2dp bar with a 1dp gap, which reads as a bar. It also halves
 * the number of views the surface mounts, lays out and redraws, which is the
 * part Android feels: a view here is a real object in the native hierarchy, not
 * a rectangle in a display list.
 */
export const MIN_BAR_PITCH = 3;

/** Fewest bars ever drawn, so a very narrow surface still shows a waveform. */
export const MIN_BAR_COUNT = 24;

/**
 * How many bars to draw across `trackWidth`, never more than the analyser
 * produced. A width of zero (before the surface has been measured) falls back
 * to `maxBars`, so the first frame is dense rather than empty.
 */
export function barCountForTrackWidth(
  trackWidth: number,
  maxBars: number,
): number {
  if (maxBars <= 0) return 0;
  if (!Number.isFinite(trackWidth) || trackWidth <= 0) return maxBars;
  const fits = Math.floor(trackWidth / MIN_BAR_PITCH);
  return Math.max(Math.min(MIN_BAR_COUNT, maxBars), Math.min(maxBars, fits));
}

/**
 * Reduce `peaks` to `count` bars by taking the loudest sample in each run.
 *
 * The maximum rather than the mean: a waveform is read for its transients, and
 * averaging a drum hit with the silence either side of it flattens exactly what
 * the reader is looking for. Returns the input unchanged when it already fits,
 * so the identity is stable and the memo above it holds.
 */
export function downsamplePeaks(
  peaks: WaveformPeaks,
  count: number,
): WaveformPeaks {
  if (count <= 0) return [];
  if (count >= peaks.length) return peaks;

  const out: number[] = new Array(count);
  for (let bar = 0; bar < count; bar += 1) {
    // Slice boundaries derived from the bar index rather than accumulated, so
    // every source sample lands in exactly one bar and none is dropped.
    const start = Math.floor((bar * peaks.length) / count);
    const end = Math.max(
      start + 1,
      Math.floor(((bar + 1) * peaks.length) / count),
    );
    let loudest = 0;
    for (let i = start; i < end && i < peaks.length; i += 1) {
      const peak = peaks[i];
      // A non-finite sample would poison the comparison and win every time.
      // `WaveformBars` guards its own use of a bad peak; this keeps one from
      // swallowing the whole run it sits in.
      if (Number.isFinite(peak) && peak > loudest) loudest = peak;
    }
    out[bar] = loudest;
  }
  return out;
}

/**
 * Where a touch at `x` — measured from the left edge of the touch surface,
 * which is inset by {@link HORIZONTAL_PADDING} — falls in the track, in
 * milliseconds. Returns null before the surface is measured or for a track of
 * unknown length.
 *
 * A worklet: the waveform maps a pointer event to a position on the UI thread
 * so a drag never waits for JavaScript. Plain callers are unaffected.
 */
export function positionFromTouchX(
  x: number,
  trackWidth: number,
  durationMs: number,
): number | null {
  'worklet';
  if (durationMs <= 0 || trackWidth <= 0) return null;
  const ratio = Math.max(0, Math.min(1, (x - HORIZONTAL_PADDING) / trackWidth));
  return Math.round(ratio * durationMs);
}

/**
 * Where a position in milliseconds sits along the track, in pixels from the
 * left edge of the track (not of the touch surface).
 *
 * The overlays are placed with this and a `translateX` rather than the
 * percentage `left` they used to carry. A percentage is a layout value: moving
 * the playhead re-ran Yoga and re-laid the surface out ten times a second and
 * on every pointer event of a drag. A translation is a draw-time value, so the
 * same movement costs a transform on an existing frame.
 */
export function trackOffsetPx(
  ms: number,
  durationMs: number,
  trackWidth: number,
): number {
  'worklet';
  if (durationMs <= 0) return 0;
  return (Math.max(0, Math.min(ms, durationMs)) / durationMs) * trackWidth;
}

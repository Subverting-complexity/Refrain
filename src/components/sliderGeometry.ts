/**
 * Where a slider's fill and thumb sit for a given 0..1 position.
 *
 * Worklets, because `SliderBar` resolves both on the UI thread every frame — a
 * drag follows the finger and a playing track glides between the engine's
 * reports, neither of which goes near React. Pulled out of the animated styles
 * so the arithmetic can be read and tested on its own: an animated style is
 * opaque under Jest, which sees only an empty object.
 *
 * Plain functions to any other caller; the directive only marks them as safe to
 * run on the UI runtime.
 */

/**
 * A position clamped to the track. Also the fill's `scaleX`: the fill is laid
 * out at full width and scaled down from its left edge, so the scale factor and
 * the fraction filled are the same number.
 *
 * A position can arrive outside 0..1 — a finger dragged past either end, or a
 * playhead the engine has reported past the duration it also reported.
 */
export function clampRatio(value: number): number {
  'worklet';
  // NaN is guarded rather than clamped, because `Math.min`/`Math.max` pass it
  // straight through and a scale of NaN blanks the fill instead of emptying
  // it. A duration of zero divides to NaN one line upstream. The infinities
  // need no guard: they clamp to the ends like any other out-of-range value.
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** How far along the track the thumb's centre sits, in pixels. */
export function thumbOffsetPx(progress: number, trackWidth: number): number {
  'worklet';
  if (!Number.isFinite(trackWidth) || trackWidth <= 0) return 0;
  return clampRatio(progress) * trackWidth;
}

/**
 * Colour maths shared across components. Kept out of any one component so a
 * single accent token can drive several tonal tiers without adding a theme
 * entry per tier.
 */

/**
 * Append an alpha channel to a `#rrggbb` hex, yielding `#rrggbbaa`. `alpha` is
 * clamped to 0..1 so callers can compose tiers arithmetically (base + a scaled
 * amplitude, say) without guarding the ends themselves.
 */
export function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${byte}`;
}

/**
 * Blend two opaque `#rrggbb` colours in sRGB, `t` of the way from `from` to
 * `to`. `t` is clamped to 0..1 so a caller can hand it an unbounded ratio
 * without guarding the ends.
 *
 * The waveform uses it to grade a played bar by its amplitude: the tier is a
 * pair of colours rather than one, so the quietest bar and the loudest one
 * can each be placed at the contrast they need. Blending in sRGB rather than
 * a perceptual space is deliberate — it is what the browser and the platform
 * do for a translucent fill, so a graded bar sits on the same ramp as the
 * translucent tints drawn beside it.
 *
 * Six-digit hex only, the same input rule as {@link luminance}, though the
 * two fail differently: that one yields `NaN` and this one `#000000`. Either
 * way the answer is obviously wrong rather than plausibly wrong, which is the
 * point — a bad token should show as black bars, not as a slightly-off tier
 * nobody notices.
 */
export function mix(from: string, to: string, t: number): string {
  const a = channels(from);
  const b = channels(to);
  const k = Math.max(0, Math.min(1, t));
  const blended = a.map((value, i) => Math.round(value + (b[i] - value) * k));
  return `#${blended.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The three sRGB channels of an opaque hex, or zeros if it is not one. */
function channels(hex: string): [number, number, number] {
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return [0, 0, 0];
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** One sRGB channel, 0..255, linearised per WCAG 2.1. */
function linearize(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Relative luminance of an opaque `#rrggbb` colour, per WCAG 2.1.
 *
 * Six-digit hex only; anything else yields `NaN`. The rejection is
 * deliberate rather than incidental: an eight-digit `#rrggbbaa` would
 * otherwise parse happily and return the luminance of the colour *without*
 * its alpha, which is a plausible-looking number that overstates contrast.
 * `withAlpha` above produces exactly that form, so the trap is one import
 * away. Compositing a translucent colour over its backdrop is the caller's
 * job, and there is no correct single answer to give them here.
 */
export function luminance(hex: string): number {
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
    return NaN;
  }
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG 2.1 contrast ratio between two opaque colours, from 1 (identical)
 * to 21 (black on white).
 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

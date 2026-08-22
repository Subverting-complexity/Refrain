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

/** One sRGB channel, 0..255, linearised per WCAG 2.1. */
function linearize(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Relative luminance of an opaque `#rrggbb` colour, per WCAG 2.1.
 *
 * Six-digit hex only. Anything else — a three-digit hex, an `rgba()`
 * string — yields `NaN` rather than a wrong number, so a caller that
 * passes one fails loudly instead of quietly comparing against garbage.
 */
export function luminance(hex: string): number {
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

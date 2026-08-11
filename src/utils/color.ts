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

/**
 * Contrast guarantees for both palettes.
 *
 * These pin the *pairings the app actually renders* — a foreground token
 * against the token it is drawn on at that call site — rather than the hex
 * values themselves, so the palette stays free to move as long as it stays
 * legible. Retuning a colour and quietly dropping a pair below AA is the
 * failure this is here to catch: it is invisible in a screenshot and
 * invisible in a diff, and it is exactly what both palettes had drifted
 * into before #264.
 */
import { darkTheme, lightTheme, Theme, ThemeColors } from '..';
import { pillColors } from '../../components/chipStyles';

/** WCAG 2.1 AA for body text and icons that carry meaning. */
const AA_TEXT = 4.5;
/** WCAG 2.1 AA (1.4.11) for a meaningful mark with no label of its own. */
const AA_NON_TEXT = 3;
/**
 * How far a card has to lift off the page to read as a card. Not a WCAG
 * figure — a floor set just under what both palettes achieve (dark 1.21,
 * light 1.18) to stop a future edit collapsing the two into one sheet, as
 * light mode's near-white-on-white pairing had (1.06).
 */
const ELEVATION_MIN = 1.15;
/** A fill has to be tellable from the page it sits on. */
const FILL_MIN = 1.5;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance of an opaque `#rrggbb` colour, per WCAG 2.1. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = [name: string, fg: keyof ThemeColors, bg: keyof ThemeColors];

/** Text and icons, each against the surface its call site draws it on. */
const TEXT_PAIRS: Pair[] = [
  ['body text on the page', 'textPrimary', 'background'],
  ['body text on a card', 'textPrimary', 'surface'],
  ['secondary text on the page', 'textSecondary', 'background'],
  ['secondary text on a card', 'textSecondary', 'surface'],
  ['label on an accent fill', 'accentText', 'accent'],
  ['accent icons on the page', 'accentForeground', 'background'],
  ['accent icons on a card', 'accentForeground', 'surface'],
  ['error text on the page', 'error', 'background'],
  ['error text on a card', 'error', 'surface'],
  ['label on an error fill', 'errorText', 'error'],
  ['the A flag label', 'markerAText', 'markerA'],
  ['the B flag label', 'markerBText', 'markerB'],
];

/** Marks that carry meaning on their own, with no label to identify them. */
const NON_TEXT_PAIRS: Pair[] = [
  ['the A marker line over the waveform', 'markerA', 'surface'],
  ['the B marker line over the waveform', 'markerB', 'surface'],
];

describe.each([
  ['dark', darkTheme],
  ['light', lightTheme],
])('%s palette', (_name: string, theme: Theme) => {
  const { colors } = theme;

  it.each(TEXT_PAIRS)('clears AA for %s', (_label, fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it.each(NON_TEXT_PAIRS)('clears AA for %s', (_label, fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it('lifts a card clear of the page', () => {
    expect(
      contrastRatio(colors.surface, colors.background),
    ).toBeGreaterThanOrEqual(ELEVATION_MIN);
  });

  it('keeps an accent fill tellable from the page behind it', () => {
    expect(
      contrastRatio(colors.accent, colors.background),
    ).toBeGreaterThanOrEqual(FILL_MIN);
  });

  // The chip resolves its own foreground per theme, so ask the real code
  // rather than restating its rule here and letting the two drift apart.
  it('clears AA for a selected chip label', () => {
    const { backgroundColor, textColor } = pillColors(theme, true);
    expect(contrastRatio(textColor, backgroundColor)).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });
});

describe('accentForeground', () => {
  it('is the accent itself in dark mode', () => {
    // A light mint on a near-black page already clears AA as a foreground,
    // so splitting the two would be a distinction with no difference.
    expect(darkTheme.colors.accentForeground).toBe(darkTheme.colors.accent);
  });

  it('is darker than the fill accent in light mode', () => {
    // The inverse: the light accent is tuned to sit *behind* dark text, so
    // it cannot double as a foreground on a light page.
    expect(luminance(lightTheme.colors.accentForeground)).toBeLessThan(
      luminance(lightTheme.colors.accent),
    );
  });
});

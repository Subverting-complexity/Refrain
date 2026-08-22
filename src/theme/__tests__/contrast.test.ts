/**
 * Contrast guarantees for both palettes.
 *
 * These pin a foreground against the token it is actually drawn on at a
 * given call site, rather than pinning the hex values, so the palette
 * stays free to move as long as it stays legible. Silent contrast
 * regressions are invisible in a screenshot and invisible in a diff,
 * which is how three of them survived in the palettes before #264.
 *
 * The pair lists below are hand-maintained and are NOT a guarantee of
 * exhaustiveness — a call site nobody adds a row for is a call site
 * nobody checks. `covers every colour token` is the backstop: it fails
 * when a token is added to `ThemeColors` and never asserted anywhere,
 * which is the failure mode that let the accent go unchecked as a
 * foreground for as long as it did. It cannot catch a *new call site*
 * that reuses an already-covered token in a new role, so adding one
 * still means adding a row here.
 */
import { darkTheme, lightTheme, Theme, ThemeColors } from '..';
import { pillColors } from '../../components/chipStyles';
import { contrastRatio } from '../../utils/color';

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
/**
 * How far an outline has to sit from what surrounds it. Well below the
 * 3:1 that 1.4.11 wants for a control identified by its border alone —
 * neither palette reaches that (dark 1.79, light 1.50) and #267 tracks
 * it. This floor only holds the line at what they do manage, so the
 * border cannot quietly drift back towards invisible.
 */
const OUTLINE_MIN = 1.45;

type Pair = [name: string, fg: keyof ThemeColors, bg: keyof ThemeColors];

/**
 * Text and icons, each against the surface its call site draws it on.
 *
 * The marker rows are here rather than among the non-text marks because
 * `MarkerControls` labels its A/B tiles with the marker colour at 13px
 * bold, which is ordinary text as far as WCAG is concerned. Holding them
 * to the 3:1 mark threshold instead is what let light mode's A marker sit
 * at 3.57 and read as covered.
 */
const TEXT_PAIRS: Pair[] = [
  ['body text on the page', 'textPrimary', 'background'],
  ['body text on a card', 'textPrimary', 'surface'],
  ['secondary text on the page', 'textSecondary', 'background'],
  ['secondary text on a card', 'textSecondary', 'surface'],
  ['a label on an accent fill', 'accentText', 'accent'],
  ['accent icons and links on the page', 'accentForeground', 'background'],
  ['accent icons on a card', 'accentForeground', 'surface'],
  ['error text on the page', 'error', 'background'],
  ['error text on a card', 'error', 'surface'],
  ['a label on an error fill', 'errorText', 'error'],
  ['the A flag label', 'markerAText', 'markerA'],
  ['the B flag label', 'markerBText', 'markerB'],
  ['the A tile label on a card', 'markerA', 'surface'],
  ['the B tile label on a card', 'markerB', 'surface'],
];

/** Marks that carry meaning on their own, with no label to identify them. */
const NON_TEXT_PAIRS: Pair[] = [
  // The seek and volume fills. Their track is painted in `border`, and
  // the edge between the two is the whole of the position readout.
  ['a slider fill against its track', 'accentForeground', 'border'],
  // The toggle's knob against its off track, which is also `border`.
  ['the toggle knob when off', 'textSecondary', 'border'],
  ['the toggle knob when on', 'accentText', 'accent'],
  // The A/B lines ruled down the waveform card. Where a line crosses the
  // bars it is against a tinted bar rather than bare `surface`, so this
  // is the easier of the two backdrops, not the worst case.
  ['the A marker line on the waveform card', 'markerA', 'surface'],
  ['the B marker line on the waveform card', 'markerB', 'surface'],
];

/** Every token asserted above, plus the ones covered by a named test. */
const COVERED = new Set<keyof ThemeColors>([
  ...TEXT_PAIRS.flatMap(([, fg, bg]) => [fg, bg]),
  ...NON_TEXT_PAIRS.flatMap(([, fg, bg]) => [fg, bg]),
  'accent',
  'border',
  'surface',
  'background',
]);

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

  it.each([
    ['the page', 'background' as const],
    ['a card', 'surface' as const],
  ])('keeps an outline visible against %s', (_label, bg) => {
    expect(contrastRatio(colors.border, colors[bg])).toBeGreaterThanOrEqual(
      OUTLINE_MIN,
    );
  });

  // The chip resolves its own foreground per theme, so ask the real code
  // rather than restating its rule here and letting the two drift apart.
  it('clears AA for a selected chip label', () => {
    const { backgroundColor, textColor } = pillColors(theme, true);
    expect(contrastRatio(textColor, backgroundColor)).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it('clears AA for an unselected chip label', () => {
    const { textColor } = pillColors(theme, false);
    // An unselected pill is transparent, so its label is on the page.
    expect(contrastRatio(textColor, colors.background)).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it('covers every colour token', () => {
    // `overlay` is the one exemption: it is an `rgba()` scrim rather than
    // an opaque hex, so it has no single ratio to assert. Everything else
    // has to appear in a pairing above.
    const uncovered = (Object.keys(colors) as (keyof ThemeColors)[]).filter(
      (token) => token !== 'overlay' && !COVERED.has(token),
    );
    expect(uncovered).toEqual([]);
  });
});

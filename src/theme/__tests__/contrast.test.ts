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
import { contrastRatio, mix } from '../../utils/color';

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
 * How far a divider or a slider track has to sit from what surrounds it.
 * Not a WCAG figure: `track` paints hairlines, the seek and volume tracks,
 * the toggle's off state and the loading placeholders, none of which have
 * to be found by their edge. What holds `track` in place is the other
 * direction, the 3:1 the fill and the knob need *on* it, so this floor
 * only stops it fading into the page entirely.
 *
 * Against the page: dark 1.79, light 1.50. Against a card: dark 1.48,
 * light 1.77. Dark-on-card is the binding case and clears this floor by
 * 0.03, so the headroom is thin in one direction even though the other
 * three have room.
 */
const TRACK_MIN = 1.45;
/**
 * The waveform's four tiers, as the step each one has to clear over the tier
 * below it. None of these is a WCAG figure, and no palette could make them
 * one: the steps chain multiplicatively, so three tiers at 3:1 each would
 * need 27:1 between the card and the quietest played bar, and the most any
 * pair of colours can reach is 21:1.
 *
 * What the split does reflect is which step carries which information. The
 * dull-to-loop step is the one that tells the reader where the loop window
 * is before it plays, so it gets much the largest share; that step used to
 * be 1.56 in dark and 1.31 in light, which is what #268 was filed for. The
 * two above it are secondary, because the cursor also marks the playhead
 * and the amplitude grading only has to read as grading.
 */
const WAVEFORM_DULL_MIN = 1.6;
const WAVEFORM_LOOP_STEP_MIN = 2.5;
const WAVEFORM_STEP_MIN = 1.5;

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

/**
 * Marks that carry meaning on their own, with no label to identify them.
 *
 * Only pairs whose strictest requirement is the 3:1 one belong here. Three
 * further marks are held to 4.5 by `TEXT_PAIRS` instead, because the same
 * two tokens also meet as text somewhere: the toggle knob when on
 * (`accentText` on `accent`, also a label on an accent fill) and the A and
 * B lines ruled down the waveform card (`markerA`/`markerB` on `surface`,
 * also the A/B tile labels). Repeating them at 3:1 would add rows that
 * cannot fail while the stricter ones pass.
 *
 * Worth noting for the marker lines: where a line crosses the bars its
 * backdrop is a tinted bar rather than bare `surface`, so even the
 * stricter row is not the worst case for them.
 */
const NON_TEXT_PAIRS: Pair[] = [
  // The seek and volume fills. Their track is painted in `track`, and
  // the edge between the two is the whole of the position readout.
  ['a slider fill against its track', 'accentForeground', 'track'],
  // The toggle's knob against its off track, which is also `track`.
  ['the toggle knob when off', 'textSecondary', 'track'],
  // The identifying edge of every outlined control: text inputs,
  // unselected chips, outlined buttons, the pressable list rows and the
  // toggle's ring. Both rows are the point of the `outline`/`track` split
  // — one token could not clear 3:1 here and stay close enough to the page
  // for the two rows above to clear it as well.
  ['an outlined control on the page', 'outline', 'background'],
  ['an outlined control on a card', 'outline', 'surface'],
];

/**
 * The waveform bar tiers in the order they are drawn, least important first.
 * Each is asserted against the one before it, and the first against the card
 * the bars sit on.
 */
const WAVEFORM_TIERS: (keyof ThemeColors)[] = [
  'waveformDull',
  'waveformLoop',
  'waveformPlayed',
  'waveformPeak',
];

/** Every token asserted above, plus the ones covered by a named test. */
const COVERED = new Set<keyof ThemeColors>([
  ...TEXT_PAIRS.flatMap(([, fg, bg]) => [fg, bg]),
  ...NON_TEXT_PAIRS.flatMap(([, fg, bg]) => [fg, bg]),
  ...WAVEFORM_TIERS,
  'accent',
  'track',
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
  ])('keeps a track or divider visible against %s', (_label, bg) => {
    expect(contrastRatio(colors.track, colors[bg])).toBeGreaterThanOrEqual(
      TRACK_MIN,
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

  it('lifts the dull waveform tier clear of the card it sits on', () => {
    expect(
      contrastRatio(colors.waveformDull, colors.surface),
    ).toBeGreaterThanOrEqual(WAVEFORM_DULL_MIN);
  });

  it('separates the loop tier from the dull one', () => {
    expect(
      contrastRatio(colors.waveformLoop, colors.waveformDull),
    ).toBeGreaterThanOrEqual(WAVEFORM_LOOP_STEP_MIN);
  });

  it.each([
    ['played from loop', 'waveformPlayed' as const, 'waveformLoop' as const],
    ['peak from played', 'waveformPeak' as const, 'waveformPlayed' as const],
  ])('separates %s', (_label, above, below) => {
    expect(contrastRatio(colors[above], colors[below])).toBeGreaterThanOrEqual(
      WAVEFORM_STEP_MIN,
    );
  });

  // `WaveformMarkers` washes the loop region with `markerA` at 5%, and it
  // draws after the bars, so the loop tier is seen through that wash. The
  // two must not fight: the step that signals the loop has to survive it.
  it('keeps the loop step intact under the marker region tint', () => {
    const tinted = mix(colors.waveformLoop, colors.markerA, 0.05);
    expect(contrastRatio(tinted, colors.waveformDull)).toBeGreaterThanOrEqual(
      WAVEFORM_LOOP_STEP_MIN,
    );
  });

  it('keeps the waveform tiers in order, dullest to loudest', () => {
    const ratios = WAVEFORM_TIERS.map((tier) =>
      contrastRatio(colors[tier], colors.surface),
    );
    expect(ratios).toEqual([...ratios].sort((a, b) => a - b));
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

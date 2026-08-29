import { TextStyle } from 'react-native';

export const MIN_TOUCH_TARGET = 44;

export type ColorMode = 'system' | 'dark' | 'light';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export type Spacing = typeof spacing;

export interface ThemeColors {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentText: string;
  /**
   * The accent at a value that reads as a foreground against `background`
   * and `surface` — for icons, text, and the waveform bars that are tinted
   * with it. `accent` itself is tuned to work as a *fill* behind
   * `accentText`, which in a light palette means it is far too pale to sit
   * on the page as a foreground. Dark mode's accent already clears AA
   * against its dark page, so there this is the same colour.
   */
  accentForeground: string;
  /**
   * The identifying edge of a control: text inputs, unselected chips,
   * outlined buttons, the pressable list rows, and the toggle's pill.
   *
   * Held to 3:1 against both `background` and `surface`, which is what
   * WCAG 2.1 SC 1.4.11 asks of a control a reader can only find by its
   * border. It was split out of a single `border` token that also painted
   * the slider and toggle tracks: those want to stay *close* to their
   * surroundings so the accent fill and the knob drawn on them stay
   * legible, which is the opposite need, and one value could not reach
   * either threshold. See `track`.
   */
  outline: string;
  /**
   * The filled bar behind a slider's position, the toggle's off state, the
   * hairline dividers, and the border of a grouping panel that is not itself
   * a control (the snippet-preview card).
   *
   * Tuned from the other side to `outline`: what matters is that
   * `accentForeground` (the fill) and `textSecondary` (the toggle knob)
   * stay at or above 3:1 when drawn on it, so it cannot move far from the
   * page without taking one of those below the line. That is also why a
   * panel border belongs here rather than on `outline`: nothing about a
   * container has to be found by its edge, and giving it the heavier colour
   * would make a box read as loudly as the controls inside it.
   */
  track: string;
  error: string;
  errorText: string;
  /**
   * Loop marker colors. Warm hues chosen to stand out against the mint
   * waveform (which is `accent`). `markerAText`/`markerBText` are the
   * legible foreground for a filled flag in that color.
   */
  markerA: string;
  markerAText: string;
  markerB: string;
  markerBText: string;
  /** Dimming scrim behind centred modal dialogs. */
  overlay: string;
  /**
   * The four colours the waveform bars are drawn in, listed from the least
   * prominent to the most prominent. Which direction that runs is a property
   * of the palette, not of this list: dark mode gets brighter as a bar
   * becomes more important and light mode gets darker.
   *
   * - `waveformDull` — outside the loop, or unplayed with no loop set. The
   *   shape of the rest of the track, as context.
   * - `waveformLoop` — inside the A/B region but not played yet. This is
   *   what tells the reader where the loop window is before it plays, so
   *   the step between it and `waveformDull` is the one that matters most.
   * - `waveformPlayed` / `waveformPeak` — the played tier, which is a pair
   *   rather than a single value: a played bar is `mix`ed between the two
   *   by its own amplitude, so the waveform still reads as a waveform.
   *   `waveformPlayed` is the quietest bar and is therefore the end that
   *   has to clear the step above `waveformLoop`.
   *
   * Opaque, and stated per theme rather than derived as one accent at three
   * alphas. The alphas were shared by both palettes, so neither could be
   * tuned without moving the other, and a single accent through alpha
   * cannot reach far enough from a near-white card to fit three legible
   * steps underneath it. See #268.
   */
  waveformDull: string;
  waveformLoop: string;
  waveformPlayed: string;
  waveformPeak: string;
}

export interface ThemeTypography {
  body: TextStyle;
  bodySmall: TextStyle;
  heading: TextStyle;
  caption: TextStyle;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: Spacing;
}

const typographyBase = {
  body: { fontSize: 16, lineHeight: 24 } as TextStyle,
  bodySmall: { fontSize: 14, lineHeight: 20 } as TextStyle,
  heading: { fontSize: 24, lineHeight: 32, fontWeight: '700' } as TextStyle,
  caption: { fontSize: 12, lineHeight: 16 } as TextStyle,
};

function makeTypography(colors: ThemeColors): ThemeTypography {
  return {
    body: { ...typographyBase.body, color: colors.textPrimary },
    bodySmall: { ...typographyBase.bodySmall, color: colors.textPrimary },
    heading: { ...typographyBase.heading, color: colors.textPrimary },
    caption: { ...typographyBase.caption, color: colors.textSecondary },
  };
}

const darkColors: ThemeColors = {
  background: '#111d1f',
  surface: '#1a2e30',
  textPrimary: '#e8f5f0',
  textSecondary: '#8ba89e',
  accent: '#7edbb8',
  accentText: '#111d1f',
  accentForeground: '#7edbb8',
  // 3.82 against the page and 3.15 against a card. The card is the binding
  // case, and this is close to the lightest the outline needs to be: a
  // heavier edge would draw a box around every input for no further gain.
  outline: '#507e83',
  // Unchanged from the `border` it replaces, so every track, divider and
  // panel edge looks exactly as it did. The slider fill sits on it at 5.81
  // and the toggle knob at 3.74.
  track: '#2a4a4e',
  error: '#f87171',
  errorText: '#1a1a1a',
  markerA: '#ffb02e',
  markerAText: '#3a2600',
  markerB: '#ff5d77',
  markerBText: '#40060f',
  overlay: 'rgba(0, 0, 0, 0.5)',
  // Against the card: 1.70, 4.40, 7.10, 10.96. The steps between them are
  // 1.70, 2.59, 1.61 and 1.54, with the largest share given to the one that
  // signals the loop window. Muted at the dull end and vivid in the middle,
  // so the loop reads as the brightest thing on the card short of the peaks.
  waveformDull: '#2e5548',
  waveformLoop: '#2fa17b',
  waveformPlayed: '#4ecca2',
  waveformPeak: '#c9e9de',
};

const lightColors: ThemeColors = {
  // Light mode is the same design as dark mode at the other end of the
  // scale, not a different palette: a green-tinted page with a near-white
  // surface lifted off it. The page is deliberately *not* white — a white
  // page leaves the surface nowhere to go, which collapses the elevation
  // step to nothing and strands the accent as the only colour on screen.
  // The step here (1.18) is within a hair of dark mode's (1.21), so a card
  // reads as a card in both.
  background: '#dfeee7',
  surface: '#fbfefc',
  textPrimary: '#12241e',
  textSecondary: '#456358',
  accent: '#3fae87',
  accentText: '#08211a',
  accentForeground: '#1c7757',
  // 3.15 against the page and 3.72 against a card. The page is the binding
  // case here, the reverse of dark mode, because the page is the darker of
  // the two surfaces a control can sit on. This is as light as the outline
  // can be and still clear 3:1, which is the value that keeps it from
  // reading as a box drawn around every input.
  outline: '#578e7a',
  // Unchanged from the `border` it replaces. It cannot go much darker
  // without taking the accent fill that sits on the seek and volume tracks
  // below 3:1 (it is at 3.05 now), which is exactly the pull that made a
  // single token unable to serve both roles.
  track: '#a6c9b8',
  error: '#c62828',
  errorText: '#ffffff',
  // Both marker colours have to work as text, not only as a fill: the A/B
  // tiles in `MarkerControls` label themselves with the marker colour at
  // 13px bold. That is the binding constraint here and it is what sets how
  // deep the amber goes — a lighter, more obviously amber hue reads fine as
  // a flag but fails AA as a label. Once it is that deep the flag takes a
  // white label, same as B.
  markerA: '#9c6618',
  markerAText: '#ffffff',
  markerB: '#b03a52',
  markerBText: '#ffffff',
  // Tinted to the palette and lighter than dark mode's scrim: a flat black
  // wash over a light page reads as a different app's dialog.
  overlay: 'rgba(10, 28, 22, 0.45)',
  // The same four steps as dark mode, at the other end of the scale: here a
  // more important bar is darker rather than brighter, so the ramp runs from
  // a muted pale green out of the way of the card to a near-black green at
  // the peaks. Against the card: 1.70, 4.41, 7.04, 11.02.
  waveformDull: '#a4cec0',
  waveformLoop: '#278666',
  waveformPlayed: '#1d634b',
  waveformPeak: '#1b4235',
};

export const darkTheme: Theme = {
  dark: true,
  colors: darkColors,
  typography: makeTypography(darkColors),
  spacing,
};

export const lightTheme: Theme = {
  dark: false,
  colors: lightColors,
  typography: makeTypography(lightColors),
  spacing,
};

// Pre-hydration CSS in app/+html.tsx must use these values directly.
export const BACKGROUND_DARK = darkColors.background;
export const BACKGROUND_LIGHT = lightColors.background;

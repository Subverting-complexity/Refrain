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
  border: string;
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
  border: '#2a4a4e',
  error: '#f87171',
  errorText: '#1a1a1a',
  markerA: '#ffb02e',
  markerAText: '#3a2600',
  markerB: '#ff5d77',
  markerBText: '#40060f',
  overlay: 'rgba(0, 0, 0, 0.5)',
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
  // Deeper than the page by more than the surface is, so an outlined
  // control still has an edge once the page itself is tinted. It stops
  // short of the 3:1 that WCAG 1.4.11 asks of a control identified by its
  // outline alone: a border that dark reads as a box drawn around every
  // input. Dark mode does not reach 3:1 either (1.79), so this is a
  // standing limit of both palettes rather than something light mode
  // gives up — see #267. The value is also capped from the other side, by
  // the seek and volume tracks, which are painted in it: darken it much
  // further and the accent fill sitting on the track drops below 3:1.
  border: '#a6c9b8',
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

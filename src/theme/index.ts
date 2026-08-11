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
  border: '#2a4a4e',
  error: '#f87171',
  errorText: '#1a1a1a',
  markerA: '#ffb02e',
  markerAText: '#3a2600',
  markerB: '#ff5d77',
  markerBText: '#ffffff',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

const lightColors: ThemeColors = {
  background: '#f2faf7',
  surface: '#ffffff',
  textPrimary: '#1a2e28',
  textSecondary: '#4a6a60',
  accent: '#3daa80',
  accentText: '#0a1612',
  border: '#cce8df',
  error: '#dc2626',
  errorText: '#ffffff',
  markerA: '#d4943a',
  markerAText: '#ffffff',
  markerB: '#c4485f',
  markerBText: '#ffffff',
  overlay: 'rgba(0, 0, 0, 0.5)',
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

import { TextStyle } from 'react-native';

export const MIN_TOUCH_TARGET = 44;

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
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  typography: {
    body: TextStyle;
    bodySmall: TextStyle;
    heading: TextStyle;
    caption: TextStyle;
  };
}

const typographyBase = {
  body: { fontSize: 16, lineHeight: 24 } as TextStyle,
  bodySmall: { fontSize: 14, lineHeight: 20 } as TextStyle,
  heading: { fontSize: 24, lineHeight: 32, fontWeight: '700' } as TextStyle,
  caption: { fontSize: 12, lineHeight: 16 } as TextStyle,
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    background: '#111d1f',
    surface: '#1a2e30',
    textPrimary: '#e8f5f0',
    textSecondary: '#8ba89e',
    accent: '#7edbb8',
    accentText: '#111d1f',
    border: '#2a4a4e',
    error: '#f87171',
    errorText: '#1a1a1a',
  },
  typography: {
    ...typographyBase,
    body: { ...typographyBase.body, color: '#e8f5f0' },
    bodySmall: { ...typographyBase.bodySmall, color: '#e8f5f0' },
    heading: { ...typographyBase.heading, color: '#e8f5f0' },
    caption: { ...typographyBase.caption, color: '#8ba89e' },
  },
};

export const lightTheme: Theme = {
  dark: false,
  colors: {
    background: '#f2faf7',
    surface: '#ffffff',
    textPrimary: '#1a2e28',
    textSecondary: '#4a6a60',
    accent: '#3daa80',
    accentText: '#ffffff',
    border: '#cce8df',
    error: '#dc2626',
    errorText: '#ffffff',
  },
  typography: {
    ...typographyBase,
    body: { ...typographyBase.body, color: '#1a2e28' },
    bodySmall: { ...typographyBase.bodySmall, color: '#1a2e28' },
    heading: { ...typographyBase.heading, color: '#1a2e28' },
    caption: { ...typographyBase.caption, color: '#4a6a60' },
  },
};

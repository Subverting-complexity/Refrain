import React, { createContext, useMemo, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { ColorMode, Theme, darkTheme, lightTheme } from './index';

export interface ThemeContextValue {
  theme: Theme;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemScheme = useSystemColorScheme();
  const [colorMode, setColorMode] = useState<ColorMode>('system');

  const resolvedTheme = useMemo(() => {
    if (colorMode === 'system') {
      return systemScheme === 'light' ? lightTheme : darkTheme;
    }
    return colorMode === 'light' ? lightTheme : darkTheme;
  }, [colorMode, systemScheme]);

  const value = useMemo(
    () => ({
      theme: resolvedTheme,
      colorMode,
      setColorMode,
    }),
    [resolvedTheme, colorMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

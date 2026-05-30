import React, { createContext, useCallback, useMemo, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { Theme, darkTheme, lightTheme } from './index';

type ColorMode = 'system' | 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  colorMode: 'system',
  setColorMode: () => {},
});

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

  const handleSetColorMode = useCallback((mode: ColorMode) => {
    setColorMode(mode);
  }, []);

  const value = useMemo(
    () => ({
      theme: resolvedTheme,
      colorMode,
      setColorMode: handleSetColorMode,
    }),
    [resolvedTheme, colorMode, handleSetColorMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

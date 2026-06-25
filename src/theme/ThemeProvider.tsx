import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { hydrateSettings } from '../services/settingsStore';
import {
  getColorMode,
  setColorMode as persistColorMode,
} from '../services/themeStore';
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
  // Seed from the persisted choice. Synchronous on every platform (native
  // reads SQLite; web reads the in-memory cache).
  const [colorMode, setColorModeState] = useState<ColorMode>(getColorMode);

  // On a cold web load the cache may still be empty when the lazy seed above
  // runs, so a persisted choice reads as the default `system` (#163). Re-read
  // once hydration resolves to reapply it before paint settles. No-op on
  // native, where hydration is a resolved no-op and the seed was correct.
  useEffect(() => {
    let cancelled = false;
    void hydrateSettings().then(() => {
      if (!cancelled) setColorModeState(getColorMode());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    persistColorMode(mode);
  }, []);

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
    [resolvedTheme, colorMode, setColorMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

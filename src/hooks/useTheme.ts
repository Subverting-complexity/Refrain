import { useContext } from 'react';
import { ThemeContext } from '../theme/ThemeProvider';

export function useTheme() {
  return useContext(ThemeContext);
}

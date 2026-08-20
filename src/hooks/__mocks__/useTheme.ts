/**
 * Manual Jest mock for the `useTheme` hook. Activate it from a test file
 * with a bare `jest.mock('../../hooks/useTheme')` (any path spelling that
 * resolves to `src/hooks/useTheme`) — Jest then substitutes this module, so
 * no per-file factory is needed.
 *
 * It returns the real dark theme tokens rather than a hand-rolled stub, so
 * every color, radius, and typography key a component reads exists with a
 * realistic value, and tests never drift from the actual theme shape. The
 * theme module is pure tokens (no React, no services), so importing it here
 * pulls in nothing stateful.
 */
import { ColorMode, darkTheme } from '../../theme';

export const mockSetColorMode = jest.fn();

export function useTheme() {
  return {
    theme: darkTheme,
    colorMode: 'dark' as ColorMode,
    setColorMode: mockSetColorMode,
  };
}

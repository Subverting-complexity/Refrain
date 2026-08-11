import React from 'react';
import { act, create } from 'react-test-renderer';

import { useTheme } from '../useTheme';
import {
  ThemeContext,
  ThemeContextValue,
  ThemeProvider,
} from '../../theme/ThemeProvider';
import { darkTheme } from '../../theme';

// Mock just the useColorScheme hook submodule. Spreading the whole
// react-native module eagerly evaluates its lazy native-backed getters
// and blows up under jest-expo.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'dark',
}));

jest.mock('../../services/themeStore', () => ({
  getColorMode: () => 'dark',
  setColorMode: jest.fn(),
}));

jest.mock('../../services/settingsStore', () => ({
  hydrateSettings: () => Promise.resolve(),
}));

let ctx: ThemeContextValue | undefined;
function Consumer() {
  ctx = useTheme();
  return null;
}

beforeEach(() => {
  ctx = undefined;
});

describe('useTheme', () => {
  it('returns the context value from ThemeProvider', async () => {
    await act(async () => {
      create(
        <ThemeProvider>
          <Consumer />
        </ThemeProvider>,
      );
    });

    expect(ctx).toBeDefined();
    expect(ctx!.colorMode).toBe('dark');
    expect(ctx!.theme).toBe(darkTheme);
    expect(typeof ctx!.setColorMode).toBe('function');
  });

  it('returns a directly provided context value', () => {
    const value: ThemeContextValue = {
      theme: darkTheme,
      colorMode: 'dark',
      setColorMode: jest.fn(),
    };
    act(() => {
      create(
        <ThemeContext.Provider value={value}>
          <Consumer />
        </ThemeContext.Provider>,
      );
    });

    expect(ctx).toBe(value);
  });

  it('throws when used outside a ThemeProvider', () => {
    // React logs the error boundary noise for an uncaught render error;
    // silence it so the expected throw does not pollute test output.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        create(<Consumer />);
      });
    }).toThrow('useTheme must be used within a ThemeProvider');
    errorSpy.mockRestore();
  });
});

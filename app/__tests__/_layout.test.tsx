import React from 'react';
import { act, create } from 'react-test-renderer';

import { headerBackButtonOptions } from '@/src/components/HeaderBackButton';

import RootLayout from '../_layout';

const mockStackOptions = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  const Stack = ({
    screenOptions,
    children,
  }: {
    screenOptions: Record<string, unknown>;
    children: React.ReactNode;
  }) => {
    mockStackOptions(screenOptions);
    return ReactLocal.createElement(ReactLocal.Fragment, null, children);
  };
  Stack.Screen = () => ReactLocal.createElement(ReactLocal.Fragment, null);
  return {
    Stack,
    ErrorBoundary: () => null,
    useRouter: () => ({ back: jest.fn(), canGoBack: mockCanGoBack }),
  };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// The layout imports Reanimated for its side effects; the real module needs
// a native Worklets runtime that the test environment does not provide.
jest.mock('react-native-reanimated', () => ({}));

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return { GestureHandlerRootView: View };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactLocal = require('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      ReactLocal.createElement(ReactLocal.Fragment, null, children),
  };
});

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('@/src/hooks/useTheme');

jest.mock('@/src/theme/ThemeProvider', () => {
  const ReactLocal = require('react');
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) =>
      ReactLocal.createElement(ReactLocal.Fragment, null, children),
  };
});

function screenOptions(): Record<string, unknown> {
  act(() => {
    create(<RootLayout />);
  });
  return mockStackOptions.mock.calls[0][0];
}

describe('RootLayout header options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('hides the platform back button', () => {
    expect(screenOptions().headerBackVisible).toBe(false);
  });

  // Which option carries the back button depends on the platform, so the
  // layout only has to spread in whatever the button's own module gives
  // it. `HeaderBackButton.test.tsx` covers the per-platform shapes and
  // what each one renders.
  it('spreads in the app back button options', () => {
    const options = screenOptions();
    const keys = Object.keys(headerBackButtonOptions());
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(typeof options[key]).toBe('function');
    }
  });
});

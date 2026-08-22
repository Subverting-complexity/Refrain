import React from 'react';
import { act, create } from 'react-test-renderer';

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
    useFocusEffect: (effect: () => void) => {
      ReactLocal.useEffect(effect, [effect]);
    },
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

type HeaderLeftOption = (props: { canGoBack?: boolean }) => React.ReactNode;

function headerLeftOption(): HeaderLeftOption {
  return screenOptions().headerLeft as HeaderLeftOption;
}

describe('RootLayout header options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('hides the platform back button', () => {
    expect(screenOptions().headerBackVisible).toBe(false);
  });

  it('renders the app back button when the stack can go back', () => {
    const headerLeft = screenOptions().headerLeft as (props: {
      canGoBack: boolean;
    }) => React.ReactElement | null;
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<>{headerLeft({ canGoBack: true })}</>);
    });
    const buttons = tree.root.findAll(
      (node) => node.props.accessibilityLabel === 'Go back',
    );
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('supplies no header-left element when there is nothing beneath', () => {
    // Returning a real null (rather than a component that renders null)
    // keeps the navigator from creating an empty header-left view, which
    // on Android would displace the title out of the native toolbar.
    const headerLeft = screenOptions().headerLeft as (props: {
      canGoBack: boolean;
    }) => React.ReactElement | null;
    expect(headerLeft({ canGoBack: false })).toBeNull();
  });

  it('supplies no header-left element when canGoBack is absent', () => {
    // `canGoBack` is optional on the navigator's props type.
    expect(headerLeftOption()({})).toBeNull();
  });
});

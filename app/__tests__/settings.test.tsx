import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import SettingsScreen from '../settings';

const mockSetColorMode = jest.fn();

jest.mock('@/src/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#0a1612',
      },
    },
    colorMode: 'system',
    setColorMode: mockSetColorMode,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@/src/components/AppearanceSettings', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    AppearanceSettings: ({
      value,
      onChange,
    }: {
      value: string;
      onChange: (mode: string) => void;
    }) =>
      ReactLocal.createElement(View, {
        testID: 'appearance-settings',
        value,
        onChange,
      }),
  };
});

function renderScreen(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<SettingsScreen />);
  });
  return tree;
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function findAppearance(tree: ReactTestRenderer) {
    const nodes = tree.root.findAll(
      (n) => n.props.testID === 'appearance-settings',
    );
    return nodes[nodes.length - 1];
  }

  it('renders the appearance settings section', () => {
    const tree = renderScreen();
    expect(findAppearance(tree)).toBeDefined();
  });

  it('passes the current color mode to AppearanceSettings', () => {
    const tree = renderScreen();
    expect(findAppearance(tree).props.value).toBe('system');
  });

  it('forwards appearance changes to setColorMode', () => {
    const tree = renderScreen();
    const appearance = findAppearance(tree);
    act(() => appearance.props.onChange('light'));
    expect(mockSetColorMode).toHaveBeenCalledWith('light');
  });
});

import React from 'react';
import { act, create } from 'react-test-renderer';

import TabLayout from '../_layout';

let mockScreenOptions: Record<string, unknown> | undefined;
let mockScreens: Record<string, unknown>[] = [];

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  function Tabs({
    screenOptions,
    children,
  }: {
    screenOptions: Record<string, unknown>;
    children: React.ReactNode;
  }) {
    mockScreenOptions = screenOptions;
    mockScreens = ReactLocal.Children.toArray(children).map(
      (child: { props: Record<string, unknown> }) => child.props,
    );
    return null;
  }
  function TabsScreen() {
    return null;
  }
  Tabs.Screen = TabsScreen;
  return { Tabs };
});

jest.mock('@/src/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: { background: '#000', textPrimary: '#fff' },
    },
  }),
}));

describe('TabLayout', () => {
  beforeEach(() => {
    mockScreenOptions = undefined;
    mockScreens.length = 0;
    act(() => {
      create(<TabLayout />);
    });
  });

  it('hides the orphaned single-tab bottom tab bar', () => {
    expect(mockScreenOptions?.tabBarStyle).toEqual({ display: 'none' });
  });

  it('still renders the Library tab', () => {
    expect(mockScreens).toHaveLength(1);
    expect(mockScreens[0].name).toBe('index');
    expect((mockScreens[0].options as { title: string }).title).toBe('Library');
  });
});

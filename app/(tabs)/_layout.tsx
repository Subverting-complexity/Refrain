import { Tabs } from 'expo-router';

import { useTheme } from '@/src/hooks/useTheme';

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        // Single-tab navigator: hide the orphaned bottom tab bar until a
        // second destination exists. See issue #83.
        tabBarStyle: { display: 'none' },
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
        }}
      />
    </Tabs>
  );
}

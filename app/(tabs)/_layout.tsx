import { Tabs, useRouter } from 'expo-router';

import { IconSquareButton } from '@/src/components/IconSquareButton';
import { useTheme } from '@/src/hooks/useTheme';

export default function TabLayout() {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        // Single-tab navigator: hide the orphaned bottom tab bar until a
        // second destination exists.
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
          headerRight: () => (
            // Ghost, like the stack headers' back button: a filled tile
            // has nothing to separate itself from up here.
            <IconSquareButton
              icon="settings-outline"
              variant="ghost"
              accessibilityLabel="Settings"
              onPress={() => router.push('/settings')}
            />
          ),
        }}
      />
    </Tabs>
  );
}

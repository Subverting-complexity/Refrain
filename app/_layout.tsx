import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HeaderBackButton } from '@/src/components/HeaderBackButton';
import { useTheme } from '@/src/hooks/useTheme';
import { ThemeProvider } from '@/src/theme/ThemeProvider';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function RootLayoutNav() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
          // Replace the platform back button — a pill carrying the
          // previous screen's title — with the app's own icon-only
          // control. Set here so every pushed screen inherits it.
          headerBackVisible: false,
          headerLeft: () => <HeaderBackButton />,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="tracks"
          options={{
            // The title is set by the screen itself, from the library entry
            // the reader opened.
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="player"
          options={{
            title: 'Now Playing',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            presentation: 'card',
          }}
        />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootLayoutNav />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

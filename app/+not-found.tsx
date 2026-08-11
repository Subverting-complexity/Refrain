import { Stack, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AccessiblePressable } from '@/src/components/AccessiblePressable';
import { useTheme } from '@/src/hooks/useTheme';
import { spacing } from '@/src/theme';

export default function NotFoundScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text style={theme.typography.heading}>Page not found</Text>
        <AccessiblePressable
          accessibilityRole="link"
          accessibilityLabel="Go to home"
          onPress={() => router.replace('/')}
          style={styles.link}
        >
          <Text style={[theme.typography.body, { color: theme.colors.accent }]}>
            Go to home
          </Text>
        </AccessiblePressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  link: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});

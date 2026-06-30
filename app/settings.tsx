import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppearanceSettings } from '@/src/components/AppearanceSettings';
import { useTheme } from '@/src/hooks/useTheme';
import { spacing } from '@/src/theme';

export default function SettingsScreen() {
  const { theme, colorMode, setColorMode } = useTheme();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <View style={styles.content}>
        <AppearanceSettings value={colorMode} onChange={setColorMode} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
});

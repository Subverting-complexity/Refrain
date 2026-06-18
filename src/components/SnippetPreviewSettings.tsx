import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

interface SnippetPreviewSettingsProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  style?: ViewStyle;
}

/**
 * Inline toggle card for the snippet preview, sitting alongside the count-in
 * settings on the player. When on, dragging an A/B marker auditions a short
 * rolling snippet around it; when off, dragging just moves the marker.
 */
export function SnippetPreviewSettings({
  enabled,
  onChange,
  style,
}: SnippetPreviewSettingsProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLabel}>
          <Ionicons
            name="headset-outline"
            size={18}
            color={theme.colors.accent}
          />
          <Text
            style={[theme.typography.body, { color: theme.colors.textPrimary }]}
          >
            Snippet preview
          </Text>
        </View>

        <AccessiblePressable
          accessibilityRole="switch"
          accessibilityLabel={`Snippet preview ${enabled ? 'on' : 'off'}`}
          accessibilityState={{ checked: enabled }}
          onPress={() => onChange(!enabled)}
          style={[
            styles.toggle,
            {
              backgroundColor: enabled
                ? theme.colors.accent
                : theme.colors.background,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.toggleThumb,
              {
                backgroundColor: enabled
                  ? theme.colors.accentText
                  : theme.colors.textSecondary,
                transform: [{ translateX: enabled ? 20 : 0 }],
              },
            ]}
          />
        </AccessiblePressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  headerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
});

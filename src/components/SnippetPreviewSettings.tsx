import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { ToggleSwitch } from './ToggleSwitch';

const SETTINGS_ROW_MIN_HEIGHT = 52;

interface SnippetPreviewSettingsProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  style?: ViewStyle;
}

/**
 * Inline toggle card for the snippet preview, rendered inside the segment
 * profile sheet. When on, dragging an A/B marker auditions a short rolling
 * snippet around it; when off, dragging just moves the marker.
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

        <ToggleSwitch
          value={enabled}
          onValueChange={onChange}
          accessibilityLabel={`Snippet preview ${enabled ? 'on' : 'off'}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: SETTINGS_ROW_MIN_HEIGHT,
  },
  headerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
});

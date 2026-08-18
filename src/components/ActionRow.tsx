import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

export interface ActionRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}

/**
 * One row in a long-press action sheet.
 *
 * Extracted so the track sheet and the folder sheet are the same control
 * rather than two that merely resemble each other — both row types are
 * reached by the same gesture, so a difference in how they respond to it
 * would read as one of them being broken.
 */
export function ActionRow({
  icon,
  label,
  onPress,
  disabled,
  color,
}: ActionRowProps) {
  const { theme } = useTheme();

  return (
    <AccessiblePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={(state) => [
        styles.row,
        {
          opacity: disabled ? 0.4 : state.pressed ? 0.7 : 1,
          borderColor: theme.colors.border,
        },
      ]}
      disabled={disabled}
    >
      <Ionicons
        name={icon}
        size={20}
        color={color ?? theme.colors.textPrimary}
        style={styles.icon}
      />
      <Text
        style={[
          theme.typography.body,
          { color: color ?? theme.colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </AccessiblePressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    marginRight: spacing.md,
  },
});

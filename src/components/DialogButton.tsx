import { StyleSheet, Text } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

export type DialogButtonVariant = 'primary' | 'default' | 'danger';

export interface DialogButtonProps {
  label: string;
  onPress: () => void;
  /** Visual weight: filled accent, bordered neutral, or destructive. */
  variant?: DialogButtonVariant;
  accessibilityLabel?: string;
}

/**
 * A full-width action button for the centred dialogs. Three variants cover the
 * primary action, neutral choices, and the single destructive option.
 */
export function DialogButton({
  label,
  onPress,
  variant = 'default',
  accessibilityLabel,
}: DialogButtonProps) {
  const { theme } = useTheme();

  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const textColor = primary
    ? theme.colors.accentText
    : danger
      ? theme.colors.error
      : theme.colors.textPrimary;

  return (
    <AccessiblePressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={(state) => [
        styles.button,
        primary
          ? { backgroundColor: theme.colors.accent }
          : { borderWidth: 1, borderColor: theme.colors.outline },
        { opacity: state.pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[theme.typography.body, { color: textColor }]}>{label}</Text>
    </AccessiblePressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
  },
});

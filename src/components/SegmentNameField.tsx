import { StyleSheet, TextInput } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';

export interface SegmentNameFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  accessibilityLabel: string;
}

export function SegmentNameField({
  value,
  onChangeText,
  accessibilityLabel,
}: SegmentNameFieldProps) {
  const { theme } = useTheme();

  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChangeText}
      placeholder="Segment name"
      placeholderTextColor={theme.colors.textSecondary}
      style={[
        styles.input,
        theme.typography.body,
        { color: theme.colors.textPrimary, borderColor: theme.colors.border },
      ]}
      autoFocus
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});

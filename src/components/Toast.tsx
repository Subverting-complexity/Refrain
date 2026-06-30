import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

export type ToastVariant = 'success' | 'error';

interface ToastProps {
  message: string | null;
  variant?: ToastVariant;
  onDismiss: () => void;
  style?: ViewStyle;
}

export function Toast({
  message,
  variant = 'success',
  onDismiss,
  style,
}: ToastProps) {
  const { theme } = useTheme();

  if (!message) {
    return null;
  }

  const isError = variant === 'error';
  const accentColor = isError ? theme.colors.error : theme.colors.accent;
  const iconName = isError ? 'alert-circle' : 'checkmark-circle';

  return (
    <View style={[styles.container, style]} pointerEvents="box-none">
      <AccessiblePressable
        accessibilityRole="alert"
        accessibilityLabel={message}
        onPress={onDismiss}
        style={[
          styles.banner,
          {
            backgroundColor: theme.colors.surface,
            borderColor: accentColor,
          },
        ]}
      >
        <Ionicons
          name={iconName}
          size={20}
          color={accentColor}
          style={styles.icon}
        />
        <Text
          style={[
            theme.typography.bodySmall,
            styles.message,
            { color: theme.colors.textPrimary },
          ]}
          numberOfLines={3}
        >
          {message}
        </Text>
      </AccessiblePressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    zIndex: 20,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  icon: {
    marginRight: spacing.sm,
  },
  message: {
    flex: 1,
  },
});

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
  // The banner is a `surface` card, so the icon and its border need the
  // foreground accent — the fill accent is too pale to read on it.
  const accentColor = isError
    ? theme.colors.error
    : theme.colors.accentForeground;
  const iconName = isError ? 'alert-circle' : 'checkmark-circle';

  return (
    <View style={[styles.container, style]}>
      <AccessiblePressable
        accessibilityRole="alert"
        accessibilityLabel={message}
        accessibilityHint="Tap to dismiss"
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
    // The toast overlays the whole screen, so only the banner itself may take
    // touches — the empty area above it must stay transparent to the controls
    // underneath. Carried as a style rather than the `pointerEvents` prop,
    // which React Native Web has deprecated.
    pointerEvents: 'box-none',
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

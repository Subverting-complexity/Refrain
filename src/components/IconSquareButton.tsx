import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { MIN_TOUCH_TARGET, radii } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

interface IconSquareButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  accessibilityRole?: 'button' | 'switch';
  accessibilityState?: Record<string, boolean>;
  accessibilityHint?: string;
  testID?: string;
}

export function IconSquareButton({
  icon,
  accessibilityLabel,
  onPress,
  active = false,
  disabled = false,
  size = MIN_TOUCH_TARGET,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityHint,
  testID,
}: IconSquareButtonProps) {
  const { theme } = useTheme();

  const mergedState = {
    disabled,
    ...accessibilityState,
  };

  return (
    <AccessiblePressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={mergedState}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={(pressState) => [
        styles.base,
        {
          width: size,
          height: size,
          backgroundColor: active ? theme.colors.accent : theme.colors.surface,
          borderColor: active ? theme.colors.accent : theme.colors.border,
          opacity: disabled ? 0.4 : pressState.pressed ? 0.7 : 1,
        } as ViewStyle,
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={active ? theme.colors.accentText : theme.colors.textSecondary}
      />
    </AccessiblePressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

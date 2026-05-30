import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { MIN_TOUCH_TARGET } from '../theme';

interface AccessiblePressableProps extends PressableProps {
  accessibilityRole: PressableProps['accessibilityRole'];
  accessibilityLabel: string;
  accessibilityState?: PressableProps['accessibilityState'];
  style?: StyleProp<ViewStyle>;
}

export function AccessiblePressable({
  style,
  ...props
}: AccessiblePressableProps) {
  return <Pressable style={[styles.base, style]} {...props} />;
}

const styles = StyleSheet.create({
  base: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

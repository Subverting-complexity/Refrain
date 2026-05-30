import React from 'react';
import { Pressable, PressableProps, StyleSheet } from 'react-native';
import { MIN_TOUCH_TARGET } from '../theme';

interface AccessiblePressableProps extends PressableProps {
  accessibilityRole: PressableProps['accessibilityRole'];
  accessibilityLabel: string;
  accessibilityState?: PressableProps['accessibilityState'];
}

export function AccessiblePressable({
  style,
  ...props
}: AccessiblePressableProps) {
  return (
    <Pressable
      style={(state) => [
        styles.base,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

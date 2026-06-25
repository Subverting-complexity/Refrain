import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { ColorMode, spacing } from '../theme';
import { ChipGroup, ChipOption } from './ChipGroup';

interface AppearanceSettingsProps {
  value: ColorMode;
  onChange: (mode: ColorMode) => void;
  style?: ViewStyle;
}

const MODE_OPTIONS: ChipOption<ColorMode>[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

/**
 * Appearance selector for the Settings screen: choose whether the app follows
 * the system scheme or is pinned to light or dark. Presentational — the screen
 * owns the persisted `colorMode` (via the theme context) and passes it down.
 */
export function AppearanceSettings({
  value,
  onChange,
  style,
}: AppearanceSettingsProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <Text style={theme.typography.bodySmall}>Appearance</Text>
      <ChipGroup
        options={MODE_OPTIONS}
        value={value}
        onChange={onChange}
        accessibilityLabelPrefix="Appearance"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
});

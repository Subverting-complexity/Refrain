import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { SKIP_PRESETS } from '../hooks/useSkipInterval';
import { spacing } from '../theme';
import { ChipGroup, ChipOption } from './ChipGroup';

interface SkipControlsProps {
  skipSeconds: number;
  onSkipSecondsChange: (seconds: number) => void;
  style?: ViewStyle;
}

const OPTIONS: ChipOption<number>[] = SKIP_PRESETS.map((s) => ({
  label: `${s}s`,
  value: s,
}));

// Compact row letting the user set how far the skip-back/forward transport
// buttons jump. Shares ChipGroup with the count-in settings so the two
// controls read and behave identically.
export function SkipControls({
  skipSeconds,
  onSkipSecondsChange,
  style,
}: SkipControlsProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.label}>
        <Ionicons
          name="play-skip-forward-outline"
          size={16}
          color={theme.colors.accent}
        />
        <Text
          style={[
            theme.typography.bodySmall,
            { color: theme.colors.textPrimary },
          ]}
        >
          Skip
        </Text>
      </View>
      <ChipGroup
        options={OPTIONS}
        value={skipSeconds}
        onChange={onSkipSecondsChange}
        accessibilityLabelPrefix="Skip amount"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});

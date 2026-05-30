import React from 'react';
import { ActivityIndicator, StyleSheet, Text, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { Track } from '../types';
import { AccessiblePressable } from './AccessiblePressable';

interface ImportButtonProps {
  onImportComplete: (track: Track) => void;
  onImportError?: (message: string) => void;
  loading?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

export function ImportButton({
  loading = false,
  onPress,
  style,
}: ImportButtonProps) {
  const { theme } = useTheme();

  return (
    <AccessiblePressable
      accessibilityRole="button"
      accessibilityLabel="Import audio file"
      accessibilityState={{ busy: loading }}
      onPress={onPress}
      disabled={loading}
      style={[styles.button, { backgroundColor: theme.colors.accent }, style]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.accentText} size="small" />
      ) : (
        <>
          <Ionicons
            name="add-circle-outline"
            size={22}
            color={theme.colors.accentText}
            style={styles.icon}
          />
          <Text style={[styles.label, { color: theme.colors.accentText }]}>
            Import Audio
          </Text>
        </>
      )}
    </AccessiblePressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
    minWidth: 160,
  },
  icon: {
    marginRight: spacing.sm,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});

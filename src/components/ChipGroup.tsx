import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

export interface ChipOption<T> {
  label: string;
  value: T;
}

interface ChipGroupProps<T> {
  /** Selectable options, rendered left-to-right and wrapping as needed. */
  options: ChipOption<T>[];
  /** Currently selected value; compared with `isEqual` (default `===`). */
  value: T;
  onChange: (value: T) => void;
  /**
   * Prefix for each chip's accessibility label, e.g. "Length" yields
   * "Length 5s". Keeps the row readable to screen readers without a
   * separate visible label per chip.
   */
  accessibilityLabelPrefix: string;
  /** Equality test for `value` vs an option, for non-primitive values. */
  isEqual?: (a: T, b: T) => boolean;
  style?: ViewStyle;
}

// Slim pills read as ~30pt tall; pad the touch area back out to the 44pt
// minimum vertically (and a little horizontally) without inflating the visual.
const CHIP_HIT_SLOP = { top: 8, bottom: 8, left: 2, right: 2 } as const;

// A compact row of single-select chips. Extracted so the count-in settings
// (mode / length / repeat) and the skip-interval control share one tactile,
// theme-aware control instead of each re-implementing chip rendering.
export function ChipGroup<T>({
  options,
  value,
  onChange,
  accessibilityLabelPrefix,
  isEqual = (a, b) => a === b,
  style,
}: ChipGroupProps<T>) {
  const { theme } = useTheme();

  return (
    <View style={[styles.row, style]}>
      {options.map((option) => {
        const selected = isEqual(value, option.value);
        return (
          <AccessiblePressable
            key={option.label}
            accessibilityRole="radio"
            accessibilityLabel={`${accessibilityLabelPrefix} ${option.label}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            // The pill is intentionally short; the hitSlop restores a ≥44pt
            // tappable area so the slimmer visual keeps the touch target.
            hitSlop={CHIP_HIT_SLOP}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? theme.colors.accent : 'transparent',
                borderColor: selected
                  ? theme.colors.accent
                  : theme.colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: selected
                    ? theme.colors.accentText
                    : theme.colors.textPrimary,
                },
              ]}
            >
              {option.label}
            </Text>
          </AccessiblePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    minWidth: 40,
    minHeight: 30,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

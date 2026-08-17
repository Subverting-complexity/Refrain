import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { SortOption } from '../types';
import { AccessiblePressable } from './AccessiblePressable';
import { CenteredDialog } from './CenteredDialog';

const SORT_LABELS: Record<SortOption, string> = {
  'name-asc': 'Name (A → Z)',
  'name-desc': 'Name (Z → A)',
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'duration-asc': 'Shortest first',
  'duration-desc': 'Longest first',
  'size-asc': 'Smallest first',
  'size-desc': 'Largest first',
  manual: 'Manual order',
};

const SORT_OPTIONS: SortOption[] = [
  'manual',
  'name-asc',
  'name-desc',
  'date-desc',
  'date-asc',
  'duration-asc',
  'duration-desc',
  'size-asc',
  'size-desc',
];

interface SortPickerProps {
  value: SortOption;
  onChange: (option: SortOption) => void;
}

export function SortPicker({ value, onChange }: SortPickerProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${SORT_LABELS[value]}`}
        accessibilityHint="Tap to change sort order"
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Ionicons
          name="swap-vertical"
          size={16}
          color={theme.colors.textSecondary}
        />
        <Text
          style={[
            theme.typography.caption,
            styles.label,
            { color: theme.colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {SORT_LABELS[value]}
        </Text>
      </AccessiblePressable>

      {open ? (
        <CenteredDialog title="Sort by" onDismiss={() => setOpen(false)}>
          {SORT_OPTIONS.map((opt) => (
            <AccessiblePressable
              key={opt}
              accessibilityRole="button"
              accessibilityLabel={SORT_LABELS[opt]}
              accessibilityState={{ selected: opt === value }}
              onPress={() => {
                onChange(opt);
                setOpen(false);
              }}
              style={[
                styles.option,
                {
                  backgroundColor:
                    opt === value
                      ? theme.colors.accent
                      : theme.colors.background,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  theme.typography.body,
                  {
                    color:
                      opt === value
                        ? theme.colors.accentText
                        : theme.colors.textPrimary,
                  },
                ]}
              >
                {SORT_LABELS[opt]}
              </Text>
            </AccessiblePressable>
          ))}
        </CenteredDialog>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  label: {
    maxWidth: 120,
  },
  option: {
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});

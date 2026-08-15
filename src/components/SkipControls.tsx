import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import {
  formatSkipLabel,
  SKIP_PRESETS,
  SkipPreference,
  SkipPreset,
} from '../services/skipIntervalStore';
import { spacing } from '../theme';
import { ChipGroup, ChipOption } from './ChipGroup';

interface SkipControlsProps {
  preference: SkipPreference;
  onPreferenceChange: (preference: SkipPreference) => void;
}

// `null` is the "full" chip: jump to the edge of the region rather than by an
// amount. Keeping it in the same row as the intervals means one control answers
// the whole question of what the skip buttons do.
const FULL_VALUE = null;

const OPTIONS: ChipOption<SkipPreset | null>[] = [
  ...SKIP_PRESETS.map((s) => ({ label: formatSkipLabel(s), value: s })),
  { label: 'Full', value: FULL_VALUE },
];

// Compact row letting the user set what the skip-back/forward transport buttons
// do: jump by a fixed amount, or run to the start/end of the loop region (the
// whole track when no region is set). Shares ChipGroup with the count-in
// settings so the two controls read and behave identically.
export function SkipControls({
  preference,
  onPreferenceChange,
}: SkipControlsProps) {
  const { theme } = useTheme();

  // In `full` mode no interval chip is selected, but the stored amount is kept
  // so picking Full and then an interval again doesn't lose the user's choice.
  const selected = preference.mode === 'full' ? FULL_VALUE : preference.seconds;

  return (
    <View style={styles.container}>
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
        value={selected}
        onChange={(value) =>
          onPreferenceChange(
            value === FULL_VALUE
              ? { mode: 'full', seconds: preference.seconds }
              : { mode: 'interval', seconds: value },
          )
        }
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

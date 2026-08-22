import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { COUNTDOWN_SECONDS_PRESETS } from '../services/countdownStore';
import { MIN_TOUCH_TARGET, spacing } from '../theme';
import {
  CountdownConfig,
  CountdownDuration,
  CountdownMode,
  CountdownRepeat,
} from '../types';
import { ChipGroup, ChipOption } from './ChipGroup';
import { ToggleSwitch } from './ToggleSwitch';

interface CountdownSettingsProps {
  config: CountdownConfig;
  onConfigChange: (config: CountdownConfig) => void;
}

// Lead-in length presets, in seconds. Seconds read more clearly than musical
// bars for a practice lead-in, and avoid coupling the duration to the BPM.
//
// Derived from the store's preset list rather than written out again, the way
// `SkipControls` builds its chips from `SKIP_PRESETS`. The store sanitizes a
// stored length by snapping it onto that same list, so a chip listed here but
// missing there would persist as the default and never read back as selected —
// a silent no-op with nothing to catch it. Deriving makes that impossible.
const DURATION_OPTIONS: ChipOption<CountdownDuration>[] =
  COUNTDOWN_SECONDS_PRESETS.map((seconds) => ({
    label: `${seconds}s`,
    value: { type: 'seconds', seconds },
  }));

const MODE_OPTIONS: ChipOption<CountdownMode>[] = [
  { label: 'Silent', value: 'silent' },
  { label: 'Metronome', value: 'metronome' },
];

const REPEAT_OPTIONS: ChipOption<CountdownRepeat>[] = [
  { label: 'Once', value: 'once' },
  { label: 'Every loop', value: 'everyLoop' },
];

function durationEqual(a: CountdownDuration, b: CountdownDuration): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'bars' && b.type === 'bars') return a.bars === b.bars;
  if (a.type === 'seconds' && b.type === 'seconds')
    return a.seconds === b.seconds;
  return false;
}

// Header-less count-in panel body. The controls drawer chip is the trigger, so
// this no longer manages its own collapse — it renders the enable toggle plus
// the Mode / Length / Repeat fields inline. The count-in ticks once per second,
// so there is no tempo (BPM) to set.
export function CountdownSettings({
  config,
  onConfigChange,
}: CountdownSettingsProps) {
  const { theme } = useTheme();

  const toggleEnabled = () => {
    onConfigChange({ ...config, enabled: !config.enabled });
  };

  return (
    <View style={styles.container}>
      <View style={styles.enableRow}>
        <Text
          style={[theme.typography.body, { color: theme.colors.textPrimary }]}
        >
          Count-in
        </Text>
        <ToggleSwitch
          value={config.enabled}
          onValueChange={toggleEnabled}
          accessibilityLabel={`Count-in ${config.enabled ? 'on' : 'off'}`}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.field}>
          <Text style={[theme.typography.bodySmall, styles.label]}>Mode</Text>
          <ChipGroup
            options={MODE_OPTIONS}
            value={config.mode}
            onChange={(mode) => onConfigChange({ ...config, mode })}
            accessibilityLabelPrefix="Mode"
          />
        </View>

        <View style={styles.field}>
          <Text style={[theme.typography.bodySmall, styles.label]}>Length</Text>
          <ChipGroup
            options={DURATION_OPTIONS}
            value={config.duration}
            onChange={(duration) => onConfigChange({ ...config, duration })}
            accessibilityLabelPrefix="Length"
            isEqual={durationEqual}
          />
        </View>

        <View style={styles.field}>
          <Text style={[theme.typography.bodySmall, styles.label]}>Repeat</Text>
          <ChipGroup
            options={REPEAT_OPTIONS}
            value={config.repeat}
            onChange={(repeat) => onConfigChange({ ...config, repeat })}
            accessibilityLabelPrefix="Repeat"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  enableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
  },
  body: {
    gap: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    width: 56,
  },
});

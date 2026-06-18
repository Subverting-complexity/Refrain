import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import {
  CountdownConfig,
  CountdownDuration,
  CountdownMode,
  CountdownRepeat,
} from '../types';
import { AccessiblePressable } from './AccessiblePressable';
import { ChipGroup, ChipOption } from './ChipGroup';

interface CountdownSettingsProps {
  config: CountdownConfig;
  onConfigChange: (config: CountdownConfig) => void;
  style?: ViewStyle;
}

// Lead-in length presets, in seconds. Seconds read more clearly than musical
// bars for a practice lead-in, and avoid coupling the duration to the BPM.
const DURATION_OPTIONS: ChipOption<CountdownDuration>[] = [
  { label: '1s', value: { type: 'seconds', seconds: 1 } },
  { label: '3s', value: { type: 'seconds', seconds: 3 } },
  { label: '5s', value: { type: 'seconds', seconds: 5 } },
  { label: '10s', value: { type: 'seconds', seconds: 10 } },
  { label: '15s', value: { type: 'seconds', seconds: 15 } },
  { label: '30s', value: { type: 'seconds', seconds: 30 } },
];

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
// the Mode / Length / Repeat / BPM fields inline.
export function CountdownSettings({
  config,
  onConfigChange,
  style,
}: CountdownSettingsProps) {
  const { theme } = useTheme();
  const [bpmText, setBpmText] = useState(String(config.bpm));
  const [bpmValid, setBpmValid] = useState(true);

  const toggleEnabled = () => {
    onConfigChange({ ...config, enabled: !config.enabled });
  };

  const handleBpmChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setBpmText(digits);
    const parsed = parseInt(digits, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 300) {
      setBpmValid(true);
      onConfigChange({ ...config, bpm: parsed });
    } else {
      setBpmValid(false);
    }
  };

  const handleBpmBlur = () => {
    if (bpmText === '') {
      setBpmText(String(config.bpm));
      setBpmValid(true);
      return;
    }
    const parsed = parseInt(bpmText, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setBpmText('1');
      onConfigChange({ ...config, bpm: 1 });
    } else if (parsed > 300) {
      setBpmText('300');
      onConfigChange({ ...config, bpm: 300 });
    }
    setBpmValid(true);
  };

  const showBpm = config.mode === 'metronome';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.enableRow}>
        <Text
          style={[theme.typography.body, { color: theme.colors.textPrimary }]}
        >
          Count-in
        </Text>
        <AccessiblePressable
          accessibilityRole="switch"
          accessibilityLabel={`Count-in ${config.enabled ? 'on' : 'off'}`}
          accessibilityState={{ checked: config.enabled }}
          onPress={toggleEnabled}
          style={[
            styles.toggle,
            {
              backgroundColor: config.enabled
                ? theme.colors.accent
                : theme.colors.background,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.toggleThumb,
              {
                backgroundColor: config.enabled
                  ? theme.colors.accentText
                  : theme.colors.textSecondary,
                transform: [{ translateX: config.enabled ? 20 : 0 }],
              },
            ]}
          />
        </AccessiblePressable>
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
            accessibilityLabelPrefix="Count in"
          />
        </View>

        {showBpm && (
          <View style={styles.field}>
            <Text style={[theme.typography.bodySmall, styles.label]}>BPM</Text>
            <View style={styles.bpmRow}>
              <TextInput
                accessibilityLabel="BPM"
                keyboardType="number-pad"
                value={bpmText}
                onChangeText={handleBpmChange}
                onBlur={handleBpmBlur}
                maxLength={3}
                style={[
                  styles.bpmInput,
                  {
                    color: theme.colors.textPrimary,
                    backgroundColor: theme.colors.background,
                    borderColor: bpmValid
                      ? theme.colors.border
                      : theme.colors.error,
                  },
                ]}
              />
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color: bpmValid
                      ? theme.colors.textSecondary
                      : theme.colors.error,
                  },
                ]}
              >
                1–300
              </Text>
            </View>
          </View>
        )}
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
    minHeight: 44,
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
  bpmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bpmInput: {
    width: 64,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
    fontSize: 14,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
});

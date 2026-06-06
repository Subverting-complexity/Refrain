import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { CountdownConfig, CountdownDuration, CountdownMode } from '../types';
import { AccessiblePressable } from './AccessiblePressable';

interface CountdownSettingsProps {
  config: CountdownConfig;
  onConfigChange: (config: CountdownConfig) => void;
  style?: ViewStyle;
}

const DURATION_PRESETS: { label: string; value: CountdownDuration }[] = [
  { label: '1 bar', value: { type: 'bars', bars: 1 } },
  { label: '2 bars', value: { type: 'bars', bars: 2 } },
  { label: '4 bars', value: { type: 'bars', bars: 4 } },
  { label: '3s', value: { type: 'seconds', seconds: 3 } },
  { label: '5s', value: { type: 'seconds', seconds: 5 } },
];

function durationEqual(a: CountdownDuration, b: CountdownDuration): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'bars' && b.type === 'bars') return a.bars === b.bars;
  if (a.type === 'seconds' && b.type === 'seconds')
    return a.seconds === b.seconds;
  return false;
}

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

  const setMode = (mode: CountdownMode) => {
    onConfigChange({ ...config, mode });
  };

  const setDuration = (duration: CountdownDuration) => {
    onConfigChange({ ...config, duration });
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

  const showBpm =
    config.mode === 'metronome' || config.duration.type === 'bars';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        <Text style={[theme.typography.body, styles.label]}>Countdown</Text>
        <AccessiblePressable
          accessibilityRole="switch"
          accessibilityLabel={`Countdown ${config.enabled ? 'on' : 'off'}`}
          accessibilityState={{ checked: config.enabled }}
          onPress={toggleEnabled}
          style={[
            styles.toggle,
            {
              backgroundColor: config.enabled
                ? theme.colors.accent
                : theme.colors.surface,
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

      {config.enabled && (
        <>
          <View style={styles.row}>
            <Text style={[theme.typography.bodySmall, styles.label]}>Mode</Text>
            <View style={styles.chipRow}>
              {(['silent', 'metronome'] as CountdownMode[]).map((mode) => (
                <AccessiblePressable
                  key={mode}
                  accessibilityRole="radio"
                  accessibilityLabel={mode}
                  accessibilityState={{ selected: config.mode === mode }}
                  onPress={() => setMode(mode)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        config.mode === mode
                          ? theme.colors.accent
                          : theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.bodySmall,
                      {
                        color:
                          config.mode === mode
                            ? theme.colors.accentText
                            : theme.colors.textPrimary,
                      },
                    ]}
                  >
                    {mode === 'silent' ? 'Silent' : 'Metronome'}
                  </Text>
                </AccessiblePressable>
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <Text style={[theme.typography.bodySmall, styles.label]}>
              Duration
            </Text>
            <View style={styles.chipRow}>
              {DURATION_PRESETS.map((preset) => (
                <AccessiblePressable
                  key={preset.label}
                  accessibilityRole="radio"
                  accessibilityLabel={preset.label}
                  accessibilityState={{
                    selected: durationEqual(config.duration, preset.value),
                  }}
                  onPress={() => setDuration(preset.value)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: durationEqual(
                        config.duration,
                        preset.value,
                      )
                        ? theme.colors.accent
                        : theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.bodySmall,
                      {
                        color: durationEqual(config.duration, preset.value)
                          ? theme.colors.accentText
                          : theme.colors.textPrimary,
                      },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </AccessiblePressable>
              ))}
            </View>
          </View>

          {showBpm && (
            <View style={styles.bpmSection}>
              <View style={styles.row}>
                <Text style={[theme.typography.bodySmall, styles.label]}>
                  BPM
                </Text>
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
                      backgroundColor: theme.colors.surface,
                      borderColor: bpmValid
                        ? theme.colors.border
                        : theme.colors.error,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  theme.typography.caption,
                  styles.bpmHint,
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
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    flex: 0,
    marginRight: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    flex: 1,
    justifyContent: 'flex-end',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.lg,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  bpmInput: {
    width: 64,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 16,
  },
  bpmSection: {
    gap: spacing.xs,
  },
  bpmHint: {
    textAlign: 'right',
  },
});

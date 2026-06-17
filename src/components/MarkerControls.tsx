import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { PlaybackStatus } from '../types';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';

interface MarkerControlsProps {
  status: PlaybackStatus;
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
  onToggleLoop: (enabled: boolean) => void;
  onClearMarkers: () => void;
  style?: ViewStyle;
}

// One-line guidance under the controls so the tap-to-place flow is
// discoverable instead of something you have to guess at.
function statusCaption(
  markerA: number | null,
  markerB: number | null,
  loopEnabled: boolean,
): string {
  if (markerA == null && markerB == null) {
    return 'Tap the wave to set A, then B';
  }
  if (markerA != null && markerB == null) {
    return 'Tap the wave to set B after A';
  }
  if (markerA == null && markerB != null) {
    return 'Tap the wave to set A before B';
  }
  const range = `${formatDuration(markerA as number)}–${formatDuration(markerB as number)}`;
  return loopEnabled
    ? `Looping ${range}`
    : `Loop ${range} ready — tap loop to start`;
}

export function MarkerControls({
  status,
  markerA,
  markerB,
  loopEnabled,
  onToggleLoop,
  onClearMarkers,
  style,
}: MarkerControlsProps) {
  const { theme } = useTheme();
  const isDisabled = status === 'idle' || status === 'error';
  const hasMarkers = markerA != null || markerB != null;
  const canLoop = markerA != null && markerB != null;
  const loopActive = canLoop && loopEnabled;
  const loopDisabled = isDisabled || !canLoop;

  const renderReadout = (
    label: 'A' | 'B',
    value: number | null,
    color: string,
  ) => (
    <View
      style={[
        styles.readout,
        {
          borderColor: value != null ? color : theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={
        value != null
          ? `Loop ${label === 'A' ? 'start' : 'end'} ${formatDuration(value)}`
          : `Loop ${label === 'A' ? 'start' : 'end'} not set`
      }
    >
      <Text style={[styles.readoutLabel, { color }]}>{label}</Text>
      <Text style={[styles.readoutValue, { color: theme.colors.textPrimary }]}>
        {value != null ? formatDuration(value) : '—'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        {renderReadout('A', markerA, theme.colors.markerA)}
        {renderReadout('B', markerB, theme.colors.markerB)}

        <AccessiblePressable
          accessibilityRole="switch"
          accessibilityLabel={loopActive ? 'Turn loop off' : 'Turn loop on'}
          accessibilityState={{ disabled: loopDisabled, checked: loopActive }}
          accessibilityHint="Repeats playback between the A and B points"
          onPress={() => onToggleLoop(!loopEnabled)}
          disabled={loopDisabled}
          style={(pressState) => [
            styles.loopButton,
            {
              backgroundColor: loopActive
                ? theme.colors.accent
                : theme.colors.surface,
              borderColor: loopActive
                ? theme.colors.accent
                : theme.colors.border,
              opacity: loopDisabled ? 0.4 : pressState.pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons
            name="repeat"
            size={20}
            color={
              loopActive ? theme.colors.accentText : theme.colors.textSecondary
            }
          />
        </AccessiblePressable>

        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel="Clear loop markers"
          accessibilityState={{ disabled: !hasMarkers }}
          onPress={onClearMarkers}
          disabled={!hasMarkers}
          style={(pressState) => [
            styles.clearButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              opacity: !hasMarkers ? 0.4 : pressState.pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="close" size={18} color={theme.colors.textPrimary} />
        </AccessiblePressable>
      </View>

      {!isDisabled && (
        <Text
          style={[styles.caption, { color: theme.colors.textSecondary }]}
          accessibilityLiveRegion="polite"
        >
          {statusCaption(markerA, markerB, loopEnabled)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  readout: {
    minWidth: 72,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  readoutLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  readoutValue: {
    fontSize: 12,
    marginTop: 2,
  },
  loopButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  caption: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

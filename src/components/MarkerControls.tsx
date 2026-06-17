import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { PlaybackStatus } from '../types';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';

export type PlaceMode = 'none' | 'A' | 'B';

interface MarkerControlsProps {
  status: PlaybackStatus;
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
  placeMode: PlaceMode;
  /** Press the A button: arm placing A (or clear both markers when A is set). */
  onPressA: () => void;
  /** Press the B button: arm placing B (or clear B when B is set). */
  onPressB: () => void;
  onToggleLoop: (enabled: boolean) => void;
  style?: ViewStyle;
}

// One-line guidance under the controls so the arm-then-tap flow is
// discoverable instead of something you have to guess at.
function statusCaption(
  markerA: number | null,
  markerB: number | null,
  loopEnabled: boolean,
  placeMode: PlaceMode,
): string {
  if (placeMode === 'A') return 'Tap the wave to drop A';
  if (placeMode === 'B') return 'Tap the wave to drop B after A';
  if (markerA == null && markerB == null) return 'Tap A to start a loop';
  if (markerA != null && markerB == null) return 'Tap B to place the loop end';
  if (markerA == null && markerB != null)
    return 'Tap A to place the loop start';
  const range = `${formatDuration(markerA as number)}–${formatDuration(markerB as number)}`;
  return loopEnabled ? `Looping ${range}` : `Plays ${range} once, then stops`;
}

export function MarkerControls({
  status,
  markerA,
  markerB,
  loopEnabled,
  placeMode,
  onPressA,
  onPressB,
  onToggleLoop,
  style,
}: MarkerControlsProps) {
  const { theme } = useTheme();
  const isDisabled = status === 'idle' || status === 'error';
  const canLoop = markerA != null && markerB != null;
  const loopActive = canLoop && loopEnabled;
  const loopDisabled = isDisabled || !canLoop;

  const renderButton = (
    label: 'A' | 'B',
    value: number | null,
    color: string,
    arming: boolean,
    disabled: boolean,
    onPress: () => void,
  ) => {
    // The sub-line communicates the button's current action: where to tap
    // while arming, the marker time once placed, or a prompt to set it.
    const sub = arming
      ? 'Tap wave'
      : value != null
        ? formatDuration(value)
        : 'Set';
    const accessibilityLabel =
      value != null
        ? `${label === 'A' ? 'Loop start' : 'Loop end'} ${formatDuration(value)}. ${
            label === 'A' ? 'Clears both markers' : 'Clears loop end'
          }`
        : arming
          ? `Cancel placing loop ${label === 'A' ? 'start' : 'end'}`
          : `Place loop ${label === 'A' ? 'start' : 'end'}`;
    return (
      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, selected: arming || value != null }}
        onPress={onPress}
        disabled={disabled}
        style={(pressState) => [
          styles.button,
          {
            borderColor: arming || value != null ? color : theme.colors.border,
            borderWidth: arming ? 2 : 1,
            backgroundColor: theme.colors.surface,
            opacity: disabled ? 0.4 : pressState.pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
        <Text
          style={[styles.buttonValue, { color: theme.colors.textPrimary }]}
          numberOfLines={1}
        >
          {sub}
        </Text>
      </AccessiblePressable>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        {renderButton(
          'A',
          markerA,
          theme.colors.markerA,
          placeMode === 'A',
          isDisabled,
          onPressA,
        )}
        {renderButton(
          'B',
          markerB,
          theme.colors.markerB,
          placeMode === 'B',
          // B can't be placed before A exists; once A is set it's available.
          isDisabled || (markerA == null && markerB == null),
          onPressB,
        )}

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
      </View>

      {!isDisabled && (
        <Text
          style={[styles.caption, { color: theme.colors.textSecondary }]}
          accessibilityLiveRegion="polite"
        >
          {statusCaption(markerA, markerB, loopEnabled, placeMode)}
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
  button: {
    minWidth: 84,
    height: 52,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  buttonValue: {
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
  caption: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

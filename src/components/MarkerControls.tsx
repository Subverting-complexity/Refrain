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
  positionMs: number;
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
  onSetMarkerA: (positionMs: number) => void;
  onSetMarkerB: (positionMs: number) => void;
  onToggleLoop: (enabled: boolean) => void;
  onClearMarkers: () => void;
  style?: ViewStyle;
}

// One-line guidance under the controls so the A/B/loop flow is discoverable
// instead of something you have to guess at.
function statusCaption(
  markerA: number | null,
  markerB: number | null,
  loopEnabled: boolean,
): string {
  if (markerA == null && markerB == null) {
    return 'Tap A, then B, to mark a loop';
  }
  if (markerA != null && markerB == null) {
    return 'Now tap B after the start point';
  }
  if (markerA == null && markerB != null) {
    return 'Tap A before the end point';
  }
  const range = `${formatDuration(markerA as number)}–${formatDuration(markerB as number)}`;
  return loopEnabled
    ? `Looping ${range}`
    : `Loop ${range} ready — tap loop to start`;
}

export function MarkerControls({
  status,
  positionMs,
  markerA,
  markerB,
  loopEnabled,
  onSetMarkerA,
  onSetMarkerB,
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

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel="Set loop start"
          accessibilityState={{
            disabled: isDisabled,
            selected: markerA != null,
          }}
          accessibilityHint="Marks the A point at the current playback position"
          onPress={() => onSetMarkerA(positionMs)}
          disabled={isDisabled}
          style={(pressState) => [
            styles.markerButton,
            {
              backgroundColor:
                markerA != null ? theme.colors.accent : theme.colors.surface,
              borderColor: theme.colors.border,
              opacity: isDisabled ? 0.4 : pressState.pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.markerLabel,
              {
                color:
                  markerA != null
                    ? theme.colors.accentText
                    : theme.colors.textPrimary,
              },
            ]}
          >
            A
          </Text>
          <Text
            style={[
              styles.markerTime,
              {
                color:
                  markerA != null
                    ? theme.colors.accentText
                    : theme.colors.textSecondary,
              },
            ]}
          >
            {markerA != null ? formatDuration(markerA) : 'Set'}
          </Text>
        </AccessiblePressable>

        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel="Set loop end"
          accessibilityState={{
            disabled: isDisabled,
            selected: markerB != null,
          }}
          accessibilityHint="Marks the B point at the current playback position"
          onPress={() => onSetMarkerB(positionMs)}
          disabled={isDisabled}
          style={(pressState) => [
            styles.markerButton,
            {
              backgroundColor:
                markerB != null ? theme.colors.accent : theme.colors.surface,
              borderColor: theme.colors.border,
              opacity: isDisabled ? 0.4 : pressState.pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.markerLabel,
              {
                color:
                  markerB != null
                    ? theme.colors.accentText
                    : theme.colors.textPrimary,
              },
            ]}
          >
            B
          </Text>
          <Text
            style={[
              styles.markerTime,
              {
                color:
                  markerB != null
                    ? theme.colors.accentText
                    : theme.colors.textSecondary,
              },
            ]}
          >
            {markerB != null ? formatDuration(markerB) : 'Set'}
          </Text>
        </AccessiblePressable>

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
            color={loopActive ? theme.colors.accentText : theme.colors.accent}
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
  markerButton: {
    minWidth: 60,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  markerTime: {
    fontSize: 11,
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

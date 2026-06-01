import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { PlaybackStatus } from '../types';
import { AccessiblePressable } from './AccessiblePressable';

interface MarkerControlsProps {
  status: PlaybackStatus;
  positionMs: number;
  markerA: number | null;
  markerB: number | null;
  onSetMarkerA: (positionMs: number) => void;
  onSetMarkerB: (positionMs: number) => void;
  onClearMarkers: () => void;
  style?: ViewStyle;
}

export function MarkerControls({
  status,
  positionMs,
  markerA,
  markerB,
  onSetMarkerA,
  onSetMarkerB,
  onClearMarkers,
  style,
}: MarkerControlsProps) {
  const { theme } = useTheme();
  const isDisabled = status === 'idle' || status === 'error';
  const hasMarkers = markerA != null || markerB != null;
  const isLooping = markerA != null && markerB != null;

  return (
    <View style={[styles.container, style]}>
      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel="Set loop start"
        accessibilityState={{ disabled: isDisabled }}
        accessibilityHint="Sets the A marker at the current playback position"
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
      </AccessiblePressable>

      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel="Set loop end"
        accessibilityState={{ disabled: isDisabled }}
        accessibilityHint="Sets the B marker at the current playback position"
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
      </AccessiblePressable>

      {isLooping && (
        <View
          style={[styles.loopBadge, { backgroundColor: theme.colors.accent }]}
          accessibilityLabel="Loop active"
        >
          <Ionicons name="repeat" size={14} color={theme.colors.accentText} />
        </View>
      )}

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
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  markerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
  },
  markerLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  loopBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
  },
});

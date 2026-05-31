import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { PlaybackStatus } from '../types';
import { AccessiblePressable } from './AccessiblePressable';

interface TransportControlsProps {
  status: PlaybackStatus;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  style?: ViewStyle;
}

export function TransportControls({
  status,
  onPlay,
  onPause,
  onStop,
  style,
}: TransportControlsProps) {
  const { theme } = useTheme();
  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';

  return (
    <View style={[styles.container, style]}>
      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel="Stop"
        accessibilityState={{ disabled: status === 'idle' }}
        onPress={onStop}
        disabled={status === 'idle'}
        style={(pressState) => [
          styles.button,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: status === 'idle' ? 0.4 : pressState.pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons name="stop" size={24} color={theme.colors.textPrimary} />
      </AccessiblePressable>

      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        accessibilityState={{ disabled: isLoading }}
        onPress={isPlaying ? onPause : onPlay}
        disabled={isLoading}
        style={(pressState) => [
          styles.playButton,
          {
            backgroundColor: theme.colors.accent,
            opacity: isLoading ? 0.4 : pressState.pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={32}
          color={theme.colors.accentText}
        />
      </AccessiblePressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
});

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
  onSkipBack: () => void;
  onSkipForward: () => void;
  /**
   * Optional "stop" action: halt playback, rewind, and hand the audio session
   * back to other apps. Rendered as a dedicated Stop control only when
   * provided, so callers that just want play/pause/skip stay unchanged.
   */
  onStop?: () => void;
  style?: ViewStyle;
}

export function TransportControls({
  status,
  onPlay,
  onPause,
  onSkipBack,
  onSkipForward,
  onStop,
  style,
}: TransportControlsProps) {
  const { theme } = useTheme();
  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';
  const isDisabled = status === 'idle' || status === 'error';

  const secondaryStyle = (pressed: boolean) => [
    styles.button,
    {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      opacity: isDisabled ? 0.4 : pressed ? 0.7 : 1,
    },
  ];

  return (
    <View style={[styles.container, style]}>
      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel="Skip back"
        accessibilityState={{ disabled: isDisabled }}
        onPress={onSkipBack}
        disabled={isDisabled}
        style={(p) => secondaryStyle(p.pressed)}
      >
        <Ionicons
          name="play-skip-back"
          size={22}
          color={theme.colors.textPrimary}
        />
      </AccessiblePressable>

      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        accessibilityState={{ disabled: isDisabled || isLoading }}
        onPress={isPlaying ? onPause : onPlay}
        disabled={isDisabled || isLoading}
        style={(pressState) => [
          styles.playButton,
          {
            backgroundColor: theme.colors.accent,
            opacity:
              isDisabled || isLoading ? 0.4 : pressState.pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={32}
          color={theme.colors.accentText}
        />
      </AccessiblePressable>

      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel="Skip forward"
        accessibilityState={{ disabled: isDisabled }}
        onPress={onSkipForward}
        disabled={isDisabled}
        style={(p) => secondaryStyle(p.pressed)}
      >
        <Ionicons
          name="play-skip-forward"
          size={22}
          color={theme.colors.textPrimary}
        />
      </AccessiblePressable>

      {onStop ? (
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel="Stop"
          accessibilityState={{ disabled: isDisabled }}
          onPress={onStop}
          disabled={isDisabled}
          style={(p) => secondaryStyle(p.pressed)}
        >
          <Ionicons name="stop" size={22} color={theme.colors.textPrimary} />
        </AccessiblePressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

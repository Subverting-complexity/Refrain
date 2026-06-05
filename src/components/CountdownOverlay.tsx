import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { CountdownState } from '../types';
import { AccessiblePressable } from './AccessiblePressable';

interface CountdownOverlayProps {
  countdownState: CountdownState;
  /**
   * Called when the user taps the overlay to cancel a running count-in.
   * When provided, the whole overlay becomes a cancel target; without it
   * the overlay is a non-interactive announcement only.
   */
  onCancel?: () => void;
  style?: ViewStyle;
}

export function CountdownOverlay({
  countdownState,
  onCancel,
  style,
}: CountdownOverlayProps) {
  const { theme } = useTheme();

  if (countdownState.phase !== 'counting') {
    return null;
  }

  const display =
    countdownState.beatsRemaining <= 0
      ? 'GO'
      : String(countdownState.beatsRemaining);

  const content = (
    <View
      style={styles.announcer}
      accessibilityRole="alert"
      accessibilityLabel={`Countdown: ${display}`}
      accessibilityLiveRegion="assertive"
    >
      <View
        style={[styles.backdrop, { backgroundColor: theme.colors.background }]}
      />
      <Text style={[styles.numeral, { color: theme.colors.accent }]}>
        {display}
      </Text>
    </View>
  );

  if (onCancel) {
    return (
      <AccessiblePressable
        style={[styles.container, style]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel count-in"
        accessibilityHint="Stops the count-in and returns to the track without playing"
      >
        {content}
      </AccessiblePressable>
    );
  }

  return <View style={[styles.container, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  announcer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    opacity: 0.85,
  },
  numeral: {
    fontSize: 120,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { CountdownState } from '../types';

interface CountdownOverlayProps {
  countdownState: CountdownState;
  style?: ViewStyle;
}

export function CountdownOverlay({
  countdownState,
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

  return (
    <View
      style={[styles.container, style]}
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
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
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

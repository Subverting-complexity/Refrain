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
    countdownState.displayValue <= 0
      ? 'GO'
      : String(countdownState.displayValue);

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
    // The alert live region stays a sibling of the cancel target rather than
    // its child: nesting an assertive live region inside a button makes some
    // screen readers interleave the count announcements with the button's
    // label. The pressable overlays the announcer and covers the same area.
    return (
      <View style={[styles.container, style]}>
        {content}
        <AccessiblePressable
          style={styles.cancelTarget}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel count-in"
          accessibilityHint="Stops the count-in and returns to the track without playing"
        />
      </View>
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
  // Invisible full-bleed press target layered over the announcer so a tap
  // anywhere cancels, while the live region stays outside the button.
  cancelTarget: {
    ...StyleSheet.absoluteFill,
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

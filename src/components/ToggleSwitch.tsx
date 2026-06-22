import { useEffect, useState } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { AccessiblePressable } from './AccessiblePressable';

interface ToggleSwitchProps {
  /** Current on/off state. */
  value: boolean;
  /** Called with the negated value when the switch is pressed. */
  onValueChange: (value: boolean) => void;
  /**
   * Full accessibility label including the state, e.g. "Count-in on". The
   * caller owns the wording so screen readers announce the control by name.
   */
  accessibilityLabel: string;
  /** Optional wrapper style override (e.g. margins). */
  style?: ViewStyle;
}

// Visual switch geometry. A full-pill track with a large knob that nearly
// fills its height reads as a modern toggle; the thumb travels the gap between
// the two end insets. Kept as constants so the travel distance stays in sync if
// the dimensions change.
const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const THUMB_SIZE = 26;
const THUMB_INSET = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

/**
 * The app's single on/off switch. A full-pill track with a floating knob that
 * slides and recolors as the value flips. Use this for every boolean toggle so
 * switches look and behave identically across screens.
 *
 * It keeps its 44pt minimum touch target via `AccessiblePressable` while
 * rendering the pill as an inner view, so the hit area never inflates the
 * visual track into a square.
 */
export function ToggleSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  style,
}: ToggleSwitchProps) {
  const { theme } = useTheme();

  // Drives both the thumb slide and the track recolor from a single 0→1 value.
  // backgroundColor interpolation rules out the native driver, which is fine
  // for a control this small. The lazy initializer creates the Animated.Value
  // once (like a ref) while keeping `progress` a plain value, not a ref.
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [value, progress]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.border, theme.colors.accent],
  });
  const thumbColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.textSecondary, theme.colors.accentText],
  });
  const thumbTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [THUMB_INSET, THUMB_INSET + THUMB_TRAVEL],
  });

  return (
    <AccessiblePressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      style={style}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: thumbColor,
              transform: [{ translateX: thumbTranslate }],
            },
          ]}
        />
      </Animated.View>
    </AccessiblePressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    // A soft lift so the knob reads as floating above the track.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
});

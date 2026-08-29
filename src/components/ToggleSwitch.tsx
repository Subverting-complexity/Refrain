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
/**
 * The ring that identifies the control.
 *
 * The off track fails SC 1.4.11 in both themes (1.79 and 1.48 in dark, 1.50
 * and 1.77 in light) because it is deliberately close to its surroundings so
 * the knob stays legible on it. The on track fails only in light, where
 * `accent` is a fill colour at 2.30 against the page; dark mode's accent
 * already clears the bar at 10.42. So the ring is what carries the boundary
 * in three of the four state-and-theme combinations, and it is drawn in all
 * four rather than appearing and disappearing with the value.
 */
const TRACK_BORDER = 1;
/**
 * The gap between the ring and the knob. One pixel tighter than the gap the
 * switch had before the ring, so the knob keeps the same 3px clearance from
 * the outer edge and the pill is unchanged to look at.
 */
export const THUMB_INSET = 2;
// React Native sizes a box including its border, so the thumb travels the
// content box rather than the full width.
export const THUMB_TRAVEL =
  TRACK_WIDTH - TRACK_BORDER * 2 - THUMB_SIZE - THUMB_INSET * 2;

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
    const animation = Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    });
    animation.start();
    // Without this stop, an in-flight animation keeps a frame scheduled after
    // unmount — in Jest that frame fires after the environment is torn down
    // and crashes the worker.
    return () => animation.stop();
  }, [value, progress]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.track, theme.colors.accent],
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
      <Animated.View
        style={[
          styles.track,
          { backgroundColor: trackColor, borderColor: theme.colors.outline },
        ]}
      >
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
    borderWidth: TRACK_BORDER,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    // Platform-standard shadow base — always black regardless of theme. Uses
    // `boxShadow` rather than the `shadow*`/`elevation` props, which React
    // Native Web has deprecated (they log a warning on every render) and which
    // React Native now maps onto this same cross-platform property.
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.18)',
  },
});

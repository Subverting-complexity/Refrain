import { StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { MIN_TOUCH_TARGET, radii } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

/**
 * How much chrome the button carries.
 *
 * `filled` is the default: a surface-filled, bordered square. It is what
 * separates the button from a card or a control row it shares space with.
 *
 * `ghost` drops the fill and the border and leaves the icon alone. Use it
 * where the button is the only thing in its area and the fill has nothing
 * to separate it from — a screen header, where a filled square reads as a
 * stray chip floating in the bar rather than as one of its controls. The
 * box is still laid out at the full touch-target size; only its paint is
 * dropped, so a ghost button occupies and responds over exactly the same
 * area as a filled one. Note that a *disabled* ghost button is therefore
 * a dimmed icon with nothing around it — legible enough as an unavailable
 * control, but no call site relies on that today.
 */
type IconSquareButtonVariant = 'filled' | 'ghost';

interface IconSquareButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: IconSquareButtonVariant;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  accessibilityRole?: 'button' | 'switch';
  accessibilityState?: Record<string, boolean>;
  accessibilityHint?: string;
  testID?: string;
}

export function IconSquareButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'filled',
  active = false,
  disabled = false,
  size = MIN_TOUCH_TARGET,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityHint,
  testID,
}: IconSquareButtonProps) {
  const { theme } = useTheme();

  // An active button is a filled one whatever the variant asks for: the
  // accent fill *is* the on-state, so dropping it would leave no way to
  // tell the two states apart.
  const ghost = variant === 'ghost' && !active;

  const mergedState = {
    disabled,
    ...accessibilityState,
  };

  return (
    <AccessiblePressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={mergedState}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={(pressState) => [
        styles.base,
        {
          width: size,
          height: size,
          backgroundColor: ghost
            ? 'transparent'
            : active
              ? theme.colors.accent
              : theme.colors.surface,
          // Transparent rather than zero-width, so the icon sits in the same
          // place whichever variant is in play.
          borderColor: ghost
            ? 'transparent'
            : active
              ? theme.colors.accent
              : theme.colors.outline,
          opacity: disabled ? 0.4 : pressState.pressed ? 0.7 : 1,
        } as ViewStyle,
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        // A ghost icon has no box to anchor it, so it takes the primary
        // text colour and reads as a peer of the header title beside it.
        // The dimmer secondary colour only works behind a fill.
        color={
          ghost
            ? theme.colors.textPrimary
            : active
              ? theme.colors.accentText
              : theme.colors.textSecondary
        }
      />
    </AccessiblePressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

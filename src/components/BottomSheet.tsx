import { ReactNode, useContext } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

const SHEET_MIN_WIDTH = 320;
const SHEET_MAX_WIDTH = 560;
const SHEET_MIN_HEIGHT = 240;
// Cap the sheet below the viewport so the backdrop stays reachable and, more
// importantly, so a body taller than the screen is bounded and scrolls instead
// of overflowing. Without the cap the sheet grows past the bottom edge (the
// overlay is bottom-aligned), pushing its content off-screen with no way to
// reach it — a saved-segment list of any length was entirely unreachable.
const SHEET_MAX_HEIGHT_RATIO = '85%';

interface BottomSheetProps {
  /** Sheet title shown in the header. */
  title: string;
  /** Dismiss the sheet (backdrop tap, close button, or hardware back). */
  onClose: () => void;
  /** Accessible label for the close affordances. Defaults to `Close {title}`. */
  closeLabel?: string;
  children: ReactNode;
}

/**
 * Shared bottom-sheet surface: a slide-up modal with a dimmable backdrop and a
 * titled header with a close button. The count-in, volume, and skip settings,
 * the marker-time editor, and the segment list each render their body inside
 * one of these so every bottom sheet in the player behaves the same way.
 *
 * ## Android system bars
 *
 * A `Modal` is its own window on Android, and a window only draws under the
 * system bars when it is told to. The app itself runs edge-to-edge — the
 * default from Expo SDK 54, and not optional on recent Android versions — so a
 * sheet that had not opted in stopped short of both bars and left the backdrop
 * undimmed behind them. `statusBarTranslucent` and `navigationBarTranslucent`
 * extend the window to the full screen; React Native ignores the second unless
 * the first is set too.
 *
 * Extending the window under the navigation bar puts the sheet's own bottom
 * edge beneath it, so the body reserves the bottom inset. Only on Android:
 * that is the only platform whose window bounds this changes.
 *
 * That same edge-to-edge layout is why the keyboard-avoidance behaviour is
 * `height` on Android rather than nothing — see the comment on the
 * `KeyboardAvoidingView` below. No sheet body takes text input today, so this
 * is a latent case rather than a live one.
 */
export function BottomSheet({
  title,
  onClose,
  closeLabel,
  children,
}: BottomSheetProps) {
  const { theme } = useTheme();
  const label = closeLabel ?? `Close ${title}`;
  // Read straight off the context rather than through `useSafeAreaInsets`,
  // which throws when no provider is mounted. A sheet must not take a screen
  // down over a missing provider; without one there is no inset to reserve.
  const insets = useContext(SafeAreaInsetsContext);
  const bottomInset = Platform.OS === 'android' ? (insets?.bottom ?? 0) : 0;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* Keeps a sheet body holding a text field above the on-screen keyboard.
          iOS pads the container; Android needs `height` rather than nothing at
          all, because under the edge-to-edge layout that is the default from
          Expo SDK 54 the window is no longer resized for the IME, so a sheet
          left to the platform would sit underneath it. Same reasoning, and the
          same behaviour, as CenteredDialog. */}
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <AccessiblePressable
          style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onClose}
        />

        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.header}>
            <Text
              style={[
                theme.typography.heading,
                { color: theme.colors.textPrimary },
              ]}
            >
              {title}
            </Text>
            <AccessiblePressable
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={onClose}
            >
              <Ionicons
                name="close"
                size={24}
                color={theme.colors.textSecondary}
              />
            </AccessiblePressable>
          </View>

          {/* The body scrolls so a tall sheet (a long segment list, a settings
              panel on a short landscape viewport) stays fully reachable.
              `alwaysBounceVertical={false}` keeps short bodies feeling static
              rather than rubber-banding for no reason. */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={[
              styles.bodyContent,
              { paddingBottom: spacing.xxl + bottomInset },
            ]}
            alwaysBounceVertical={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    width: '100%',
    minWidth: SHEET_MIN_WIDTH,
    maxWidth: SHEET_MAX_WIDTH,
    minHeight: SHEET_MIN_HEIGHT,
    maxHeight: SHEET_MAX_HEIGHT_RATIO,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  // `flexGrow: 0` keeps a short body at its natural height instead of the
  // ScrollView stretching to fill the sheet's minHeight.
  body: {
    flexGrow: 0,
  },
  // The bottom padding lives on the scroll content (not the sheet) so the last
  // row can scroll clear of the bottom edge. The component adds the Android
  // navigation-bar inset on top of this: 32 alone is less than the 48dp a
  // three-button navigation bar takes, which would leave the last row of a
  // sheet under it and untappable.
  bodyContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
});

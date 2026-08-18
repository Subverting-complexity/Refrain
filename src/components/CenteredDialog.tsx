import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

const DIALOG_MAX_WIDTH = 420;

export interface CenteredDialogProps {
  /** Heading shown at the top of the card. */
  title: string;
  /** Optional supporting line under the title. */
  message?: string;
  /** Dialog body — typically a column of action buttons. */
  children: ReactNode;
  /** Called when the backdrop is tapped or the platform back gesture fires. */
  onDismiss: () => void;
}

/**
 * A centred modal card on a dimmed backdrop, used for the segment save, track
 * rename and confirmation dialogs. Tapping the backdrop dismisses it. Kept
 * presentational so each caller owns its own actions.
 *
 * ## Keyboard handling
 *
 * Several of these dialogs autofocus a text field, so the card has to stay
 * both visible and reachable while the on-screen keyboard is up. Three pieces
 * cooperate:
 *
 *  - `KeyboardAvoidingView` shrinks the centring container to the space the
 *    keyboard leaves, which re-centres the card above it. Android needs
 *    `height` rather than no behaviour at all: under the edge-to-edge layout
 *    that is the default from Expo SDK 54 the window is no longer resized for
 *    the IME, so a dialog left to the platform would simply sit underneath it.
 *  - The card is wrapped in a `ScrollView` that shrinks rather than overflows,
 *    so a tall dialog on a short keyboard-reduced viewport scrolls instead of
 *    clipping its buttons off-screen.
 *  - `keyboardShouldPersistTaps="handled"` lets Save and Cancel fire on the
 *    first tap while the keyboard is open, instead of spending that tap on
 *    dismissing the keyboard.
 *
 * `statusBarTranslucent` keeps the backdrop covering the full screen on
 * Android, which the keyboard-driven resize would otherwise expose.
 */
export function CenteredDialog({
  title,
  message,
  children,
  onDismiss,
}: CenteredDialogProps) {
  const { theme } = useTheme();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <AccessiblePressable
          style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          onPress={onDismiss}
        />
        <ScrollView
          style={styles.scrollArea}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <Text
              style={[
                theme.typography.heading,
                { color: theme.colors.textPrimary },
              ]}
            >
              {title}
            </Text>
            {message ? (
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {message}
              </Text>
            ) : null}
            <View style={styles.actions}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  scrollArea: {
    width: '100%',
    maxWidth: DIALOG_MAX_WIDTH,
    // Hug the card's height when it fits, shrink and scroll when it does not.
    // A ScrollView neither grows nor shrinks by default, so without this it
    // would overflow the keyboard-reduced overlay instead of scrolling.
    flexGrow: 0,
    flexShrink: 1,
  },
  card: {
    width: '100%',
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
});

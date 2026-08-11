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
 */
export function BottomSheet({
  title,
  onClose,
  closeLabel,
  children,
}: BottomSheetProps) {
  const { theme } = useTheme();
  const label = closeLabel ?? `Close ${title}`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* iOS lifts the sheet above the on-screen keyboard when a sheet body
          holds a text field; Android resizes the window itself. */}
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            contentContainerStyle={styles.bodyContent}
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
  // row can scroll clear of the bottom edge.
  bodyContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
});

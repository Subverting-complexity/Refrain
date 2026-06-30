import { ReactNode } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

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
      <View style={styles.overlay}>
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

          {children}
        </View>
      </View>
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    // Give every bottom panel a meaningful footprint instead of collapsing
    // into a thin strip at the very bottom: a height floor so the sheet
    // claims real screen space, and a width floor (capped + centred) so it
    // stays usable on narrow layouts without stretching on wide ones.
    width: '100%',
    minWidth: 320,
    maxWidth: 560,
    minHeight: 240,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

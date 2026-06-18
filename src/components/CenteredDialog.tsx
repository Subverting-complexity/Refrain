import { ReactNode } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

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
 * A centred modal card on a dimmed backdrop, used for the segment save and
 * unsaved-edit dialogs. Tapping the backdrop dismisses it. Kept presentational
 * so each caller owns its own actions.
 */
export function CenteredDialog({
  title,
  message,
  children,
  onDismiss,
}: CenteredDialogProps) {
  const { theme } = useTheme();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <AccessiblePressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          onPress={onDismiss}
        />
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
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
      </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: spacing.xl,
    gap: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
});

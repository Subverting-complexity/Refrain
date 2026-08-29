import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';

export interface ConfirmDestructiveDialogProps {
  /** Heading, usually the question being asked. */
  title: string;
  /** Optional supporting line spelling out the consequence. */
  message?: string;
  /** Label on the destructive button. */
  confirmLabel: string;
  /** Spoken label on the destructive button, which should name the target. */
  confirmAccessibilityLabel: string;
  /** Label on the button that backs out. Defaults to `Cancel`. */
  cancelLabel?: string;
  /** Spoken label on the cancel button. Defaults to `cancelLabel`. */
  cancelAccessibilityLabel?: string;
  /** Runs the destructive action. Called after {@link onDismiss}. */
  onConfirm: () => void;
  /**
   * Closes the dialog by clearing whatever state is holding it open. This is
   * the Cancel button, the backdrop tap, and the first thing that happens when
   * the user confirms.
   */
  onDismiss: () => void;
}

/**
 * The confirm-then-destroy dialog: a title, a consequence, a `danger` button
 * and a way out. Used for deleting a track and for deleting a folder, which
 * built the same three pieces by hand until this existed.
 *
 * ## Why the ordering lives here
 *
 * Confirming runs `onDismiss` *before* `onConfirm`, so the state holding the
 * dialog open is cleared before the destructive work starts. That ordering is
 * a policy rather than incidental: the delete handlers are async, and a
 * re-render arriving while one is in flight would otherwise find the pending
 * target still set and put the dialog back on screen mid-delete.
 *
 * Both call sites re-derived that ordering by hand, with nothing at either
 * site saying why it mattered. Owning it here means a new destructive
 * confirmation gets it without having to know about it.
 *
 * `onConfirm` is deliberately synchronous in the type. Call sites that fire an
 * async handler pass `() => void handler(id)`, which keeps the floating
 * promise visible at the site that owns it rather than inside this component.
 */
export function ConfirmDestructiveDialog({
  title,
  message,
  confirmLabel,
  confirmAccessibilityLabel,
  cancelLabel = 'Cancel',
  cancelAccessibilityLabel,
  onConfirm,
  onDismiss,
}: ConfirmDestructiveDialogProps) {
  return (
    <CenteredDialog title={title} message={message} onDismiss={onDismiss}>
      <DialogButton
        label={confirmLabel}
        accessibilityLabel={confirmAccessibilityLabel}
        variant="danger"
        onPress={() => {
          onDismiss();
          onConfirm();
        }}
      />
      <DialogButton
        label={cancelLabel}
        accessibilityLabel={cancelAccessibilityLabel}
        variant="default"
        onPress={onDismiss}
      />
    </CenteredDialog>
  );
}

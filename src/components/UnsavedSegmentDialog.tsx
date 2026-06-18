import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';

export interface UnsavedSegmentDialogProps {
  /** Name of the loaded segment with unsaved marker changes. */
  profileName: string;
  /** Overwrite the loaded segment, then continue the pending action. */
  onSave: () => void;
  /** Abandon the segment edit, then continue the pending action. */
  onDiscard: () => void;
  /** Stay put — cancel the pending load or navigation. */
  onCancel: () => void;
}

/**
 * Guard shown when a dirty loaded segment would be lost — the user loads a
 * different segment or leaves the player. Discard abandons only the named
 * segment's update; the live per-track markers persist as today.
 */
export function UnsavedSegmentDialog({
  profileName,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedSegmentDialogProps) {
  return (
    <CenteredDialog
      title="Unsaved segment changes"
      message={`Save your changes to “${profileName}” first?`}
      onDismiss={onCancel}
    >
      <DialogButton
        label="Save"
        accessibilityLabel="Save segment changes"
        variant="primary"
        onPress={onSave}
      />
      <DialogButton
        label="Discard"
        accessibilityLabel="Discard segment changes"
        variant="danger"
        onPress={onDiscard}
      />
      <DialogButton label="Cancel" variant="default" onPress={onCancel} />
    </CenteredDialog>
  );
}

import { SegmentNameDialog } from './SegmentNameDialog';

export interface SegmentRenameDialogProps {
  /** Current name of the segment, pre-filled into the field. */
  currentName: string;
  /** Save the trimmed new name. Only called when the field is non-empty. */
  onSave: (name: string) => void;
  /** Dismiss without renaming. */
  onCancel: () => void;
}

/**
 * Centred rename dialog for a saved segment. A thin policy wrapper over the
 * shared {@link SegmentNameDialog}: an emptied field means "I changed my mind",
 * so it dismisses rather than saving a nameless segment.
 */
export function SegmentRenameDialog({
  currentName,
  onSave,
  onCancel,
}: SegmentRenameDialogProps) {
  return (
    <SegmentNameDialog
      title="Rename segment"
      initialName={currentName}
      fieldAccessibilityLabel="Segment name"
      confirmAccessibilityLabel="Confirm rename"
      onConfirm={(name) => (name ? onSave(name) : onCancel())}
      onCancel={onCancel}
    />
  );
}

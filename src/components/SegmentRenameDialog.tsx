import { useState } from 'react';

import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';
import { SegmentNameField } from './SegmentNameField';

export interface SegmentRenameDialogProps {
  /** Current name of the segment, pre-filled into the field. */
  currentName: string;
  /** Save the trimmed new name. Only called when the field is non-empty. */
  onSave: (name: string) => void;
  /** Dismiss without renaming. */
  onCancel: () => void;
}

export function SegmentRenameDialog({
  currentName,
  onSave,
  onCancel,
}: SegmentRenameDialogProps) {
  const [draftName, setDraftName] = useState(currentName);

  const confirm = () => {
    const name = draftName.trim();
    if (name) onSave(name);
    else onCancel();
  };

  return (
    <CenteredDialog title="Rename segment" onDismiss={onCancel}>
      <SegmentNameField
        accessibilityLabel="Segment name"
        value={draftName}
        onChangeText={setDraftName}
      />
      <DialogButton
        label="Save"
        accessibilityLabel="Confirm rename"
        variant="primary"
        onPress={confirm}
      />
      <DialogButton label="Cancel" variant="default" onPress={onCancel} />
    </CenteredDialog>
  );
}

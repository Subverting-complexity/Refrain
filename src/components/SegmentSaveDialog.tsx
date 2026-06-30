import { useState } from 'react';

import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';
import { SegmentNameField } from './SegmentNameField';

export interface SegmentSaveDialogProps {
  /**
   * Name of the loaded segment when it is dirty and can be overwritten. `null`
   * when nothing is loaded (or it is unchanged) — the dialog then goes straight
   * to naming a new segment, since there is nothing to override.
   */
  loadedName: string | null;
  /** Pre-filled name for a new segment (the next "Segment N"). */
  suggestedName: string;
  /** Overwrite the loaded segment with the live region. */
  onOverride: () => void;
  /** Create a new segment under the given name. */
  onSaveNew: (name: string) => void;
  /** Dismiss without saving. */
  onCancel: () => void;
}

/**
 * The player's Save flow. When a dirty segment is loaded it first offers
 * Override / Save as new / Cancel; otherwise it opens straight to a name field
 * for a brand-new segment. Picking "Save as new" reveals the same name field.
 */
export function SegmentSaveDialog({
  loadedName,
  suggestedName,
  onOverride,
  onSaveNew,
  onCancel,
}: SegmentSaveDialogProps) {
  const [naming, setNaming] = useState(loadedName == null);
  const [draftName, setDraftName] = useState(suggestedName);

  const confirmNew = () => onSaveNew(draftName.trim() || suggestedName);

  if (!naming && loadedName != null) {
    return (
      <CenteredDialog
        title="Save segment"
        message={`"${loadedName}" has unsaved marker changes.`}
        onDismiss={onCancel}
      >
        <DialogButton
          label={`Override "${loadedName}"`}
          accessibilityLabel="Override loaded segment"
          variant="primary"
          onPress={onOverride}
        />
        <DialogButton
          label="Save as new segment"
          variant="default"
          onPress={() => setNaming(true)}
        />
        <DialogButton label="Cancel" variant="default" onPress={onCancel} />
      </CenteredDialog>
    );
  }

  return (
    <CenteredDialog title="Save as new segment" onDismiss={onCancel}>
      <SegmentNameField
        accessibilityLabel="New segment name"
        value={draftName}
        onChangeText={setDraftName}
      />
      <DialogButton
        label="Save"
        accessibilityLabel="Confirm save new segment"
        variant="primary"
        onPress={confirmNew}
      />
      <DialogButton label="Cancel" variant="default" onPress={onCancel} />
    </CenteredDialog>
  );
}

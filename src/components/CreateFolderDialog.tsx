import { NameEntryDialog } from './NameEntryDialog';

export interface CreateFolderDialogProps {
  /** Create a folder under the trimmed name. Never called with an empty name. */
  onSave: (name: string) => void;
  /** Dismiss without creating anything. */
  onCancel: () => void;
}

/**
 * Centred dialog for naming a new folder. A thin policy wrapper over the
 * shared {@link NameEntryDialog}, which owns the field, its styling and the
 * Save/Cancel pair.
 *
 * The one decision here is what an empty field means: nothing. Unlike the
 * rename dialogs, where blanking the name reads as "I changed my mind" and
 * dismisses, confirming an unnamed *new* folder is more likely a mis-tap than
 * an intention, so the dialog stays open with the field still focused.
 */
export function CreateFolderDialog({
  onSave,
  onCancel,
}: CreateFolderDialogProps) {
  function handleConfirm(name: string) {
    if (name) onSave(name);
  }

  return (
    <NameEntryDialog
      title="New folder"
      initialName=""
      placeholder="Folder name"
      fieldAccessibilityLabel="Folder name"
      confirmLabel="Create"
      confirmAccessibilityLabel="Create folder"
      onConfirm={handleConfirm}
      onCancel={onCancel}
    />
  );
}

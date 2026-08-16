import { getBaseName, withBaseName } from '../utils/filenameParts';
import { NameEntryDialog } from './NameEntryDialog';

export interface TrackRenameDialogProps {
  /** Current filename of the track, including its extension. */
  currentFilename: string;
  /**
   * Save the new filename. Only called with a non-empty name that actually
   * differs from `currentFilename`, and always with the original extension
   * still attached.
   */
  onSave: (filename: string) => void;
  /** Dismiss without renaming. */
  onCancel: () => void;
}

/**
 * Centred rename dialog for a library track. A thin policy wrapper over the
 * shared {@link NameEntryDialog} that owns two decisions:
 *
 *  - **The extension is not editable.** Only the base name is offered, and the
 *    original extension is reattached on save. `Track.format` is separate
 *    metadata and the audio lives at `tracks/<id>.<format>`, so an editable
 *    extension could only ever make the displayed name lie about the file.
 *  - **An empty or unchanged name dismisses.** Blanking the field reads as "I
 *    changed my mind" rather than a request for a nameless track, and a name
 *    that matches what is already stored has nothing to write — either way the
 *    caller is spared a pointless save and its confirmation toast.
 */
export function TrackRenameDialog({
  currentFilename,
  onSave,
  onCancel,
}: TrackRenameDialogProps) {
  function handleConfirm(name: string) {
    const nextFilename = withBaseName(currentFilename, name);
    if (!nextFilename || nextFilename === currentFilename) {
      onCancel();
      return;
    }
    onSave(nextFilename);
  }

  return (
    <NameEntryDialog
      title="Rename track"
      initialName={getBaseName(currentFilename)}
      placeholder="Track name"
      fieldAccessibilityLabel="Track name"
      confirmAccessibilityLabel={`Confirm rename ${currentFilename}`}
      onConfirm={handleConfirm}
      onCancel={onCancel}
    />
  );
}

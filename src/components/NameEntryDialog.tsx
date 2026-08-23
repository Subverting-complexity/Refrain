import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';

export interface NameEntryDialogProps {
  /** Dialog heading, e.g. "Rename segment". */
  title: string;
  /** Name pre-filled into the field. See the remount contract below. */
  initialName: string;
  /** Placeholder shown when the field is empty, e.g. "Segment name". */
  placeholder: string;
  /** Accessibility label for the name field. */
  fieldAccessibilityLabel: string;
  /**
   * Visible label on the confirm button. Defaults to `Save`, which is right
   * for the rename and save-as flows; naming something that does not exist
   * yet reads better as `Create`.
   */
  confirmLabel?: string;
  /** Accessibility label for the confirm button. */
  confirmAccessibilityLabel: string;
  /**
   * Confirm with the trimmed draft name. May be an empty string — deciding what
   * an empty name means is the caller's policy (rename cancels, save falls back
   * to the suggested name).
   */
  onConfirm: (name: string) => void;
  /** Dismiss without confirming. */
  onCancel: () => void;
}

/**
 * The shared name-entry card behind {@link SegmentRenameDialog}, the
 * new-segment step of {@link SegmentSaveDialog}, {@link TrackRenameDialog}
 * and {@link CreateFolderDialog}:
 * a centred dialog wrapping an autofocused name field plus Save and Cancel.
 * Being a centred card (rather than a bottom-anchored sheet) keeps the field
 * clear of the on-screen keyboard so the user can see what they are typing.
 *
 * Most callers open this on a name that already exists — a segment's current
 * name, the next suggested one, a track's filename — so the field selects its
 * contents on focus and typing replaces the old name in one go. On an empty
 * field (a brand-new folder) there is nothing to select, so the same setting
 * simply does nothing.
 *
 * **Remount contract:** `initialName` seeds the draft once, on mount. Callers
 * must mount this dialog per open — `{visible ? <Dialog … /> : null}`, as the
 * player, the profile sheet and the library row all do — so each open starts
 * from a fresh seed. A later `initialName` change on a mounted dialog is
 * ignored by design: re-seeding mid-edit would discard what the user is typing.
 */
export function NameEntryDialog({
  title,
  initialName,
  placeholder,
  fieldAccessibilityLabel,
  confirmLabel = 'Save',
  confirmAccessibilityLabel,
  onConfirm,
  onCancel,
}: NameEntryDialogProps) {
  const { theme } = useTheme();
  const [draftName, setDraftName] = useState(initialName);

  const confirm = () => onConfirm(draftName.trim());

  return (
    <CenteredDialog title={title} onDismiss={onCancel}>
      <TextInput
        accessibilityLabel={fieldAccessibilityLabel}
        value={draftName}
        onChangeText={setDraftName}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          styles.input,
          theme.typography.body,
          { color: theme.colors.textPrimary, borderColor: theme.colors.border },
        ]}
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={confirm}
      />
      <DialogButton
        label={confirmLabel}
        accessibilityLabel={confirmAccessibilityLabel}
        variant="primary"
        onPress={confirm}
      />
      <DialogButton label="Cancel" variant="default" onPress={onCancel} />
    </CenteredDialog>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});

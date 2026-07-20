import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';

export interface SegmentRenameDialogProps {
  /** Current name of the segment, pre-filled into the field. */
  currentName: string;
  /** Save the trimmed new name. Only called when the field is non-empty. */
  onSave: (name: string) => void;
  /** Dismiss without renaming. */
  onCancel: () => void;
}

/**
 * Centred rename dialog for a saved segment. Mirrors the new-segment naming
 * step of {@link SegmentSaveDialog}: a name field plus a Save button. Being a
 * centred card (rather than the bottom-anchored profile sheet) keeps the field
 * clear of the on-screen keyboard so the user can see what they are typing.
 */
export function SegmentRenameDialog({
  currentName,
  onSave,
  onCancel,
}: SegmentRenameDialogProps) {
  const { theme } = useTheme();
  const [draftName, setDraftName] = useState(currentName);

  const confirm = () => {
    const name = draftName.trim();
    if (name) onSave(name);
    else onCancel();
  };

  return (
    <CenteredDialog title="Rename segment" onDismiss={onCancel}>
      <TextInput
        accessibilityLabel="Segment name"
        value={draftName}
        onChangeText={setDraftName}
        placeholder="Segment name"
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          styles.input,
          theme.typography.body,
          { color: theme.colors.textPrimary, borderColor: theme.colors.border },
        ]}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={confirm}
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

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});

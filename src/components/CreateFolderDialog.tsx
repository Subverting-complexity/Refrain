import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';

export interface CreateFolderDialogProps {
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function CreateFolderDialog({
  onSave,
  onCancel,
}: CreateFolderDialogProps) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState('');

  const confirm = () => {
    const trimmed = draft.trim();
    if (trimmed) onSave(trimmed);
  };

  return (
    <CenteredDialog title="New folder" onDismiss={onCancel}>
      <TextInput
        accessibilityLabel="Folder name"
        value={draft}
        onChangeText={setDraft}
        placeholder="Folder name"
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
        label="Create"
        accessibilityLabel="Create folder"
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

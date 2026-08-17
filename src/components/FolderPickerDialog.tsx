import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { Folder } from '../types';
import { AccessiblePressable } from './AccessiblePressable';
import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';

export interface FolderPickerDialogProps {
  folders: Folder[];
  currentFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onCancel: () => void;
}

export function FolderPickerDialog({
  folders,
  currentFolderId,
  onSelect,
  onCancel,
}: FolderPickerDialogProps) {
  const { theme } = useTheme();

  return (
    <CenteredDialog title="Move to folder" onDismiss={onCancel}>
      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel="Library root (no folder)"
        accessibilityState={{ selected: currentFolderId === null }}
        onPress={() => onSelect(null)}
        style={[
          styles.option,
          {
            backgroundColor:
              currentFolderId === null
                ? theme.colors.accent
                : theme.colors.background,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.optionContent}>
          <Ionicons
            name="library-outline"
            size={18}
            color={
              currentFolderId === null
                ? theme.colors.accentText
                : theme.colors.textPrimary
            }
            style={styles.optionIcon}
          />
          <Text
            style={[
              theme.typography.body,
              {
                color:
                  currentFolderId === null
                    ? theme.colors.accentText
                    : theme.colors.textPrimary,
              },
            ]}
          >
            Library root
          </Text>
        </View>
      </AccessiblePressable>

      {folders.map((f) => (
        <AccessiblePressable
          key={f.id}
          accessibilityRole="button"
          accessibilityLabel={f.name}
          accessibilityState={{ selected: f.id === currentFolderId }}
          onPress={() => onSelect(f.id)}
          style={[
            styles.option,
            {
              backgroundColor:
                f.id === currentFolderId
                  ? theme.colors.accent
                  : theme.colors.background,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.optionContent}>
            <Ionicons
              name="folder"
              size={18}
              color={
                f.id === currentFolderId
                  ? theme.colors.accentText
                  : theme.colors.textPrimary
              }
              style={styles.optionIcon}
            />
            <Text
              style={[
                theme.typography.body,
                {
                  color:
                    f.id === currentFolderId
                      ? theme.colors.accentText
                      : theme.colors.textPrimary,
                },
              ]}
              numberOfLines={1}
            >
              {f.name}
            </Text>
          </View>
        </AccessiblePressable>
      ))}

      <DialogButton label="Cancel" variant="default" onPress={onCancel} />
    </CenteredDialog>
  );
}

const styles = StyleSheet.create({
  option: {
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    marginRight: spacing.sm,
  },
});

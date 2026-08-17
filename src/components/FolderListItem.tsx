import { useRef, useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { Folder } from '../types';
import { AccessiblePressable } from './AccessiblePressable';
import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';

interface FolderListItemProps {
  folder: Folder;
  trackCount: number;
  onPress?: (folder: Folder) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, currentName: string) => void;
  style?: ViewStyle;
}

export function FolderListItem({
  folder,
  trackCount,
  onPress,
  onDelete,
  onRename,
  style,
}: FolderListItemProps) {
  const { theme } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function confirmDelete() {
    setConfirmingDelete(true);
  }

  function handleCancelDelete() {
    setConfirmingDelete(false);
    swipeableRef.current?.close();
  }

  function handleConfirmDelete() {
    setConfirmingDelete(false);
    onDelete?.(folder.id);
  }

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        {onRename ? (
          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Rename ${folder.name}`}
            onPress={() => {
              swipeableRef.current?.close();
              onRename(folder.id, folder.name);
            }}
            style={[
              styles.swipeAction,
              { backgroundColor: theme.colors.accent },
            ]}
          >
            <Ionicons
              name="pencil-outline"
              size={20}
              color={theme.colors.accentText}
            />
          </AccessiblePressable>
        ) : null}
        {onDelete ? (
          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${folder.name}`}
            onPress={confirmDelete}
            style={[
              styles.swipeAction,
              { backgroundColor: theme.colors.error },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={theme.colors.errorText}
            />
          </AccessiblePressable>
        ) : null}
      </View>
    );
  }

  const subtitle = trackCount === 1 ? '1 track' : `${trackCount} tracks`;

  return (
    <>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={
          onDelete || onRename ? renderRightActions : undefined
        }
        containerStyle={style}
        friction={2}
        rightThreshold={40}
      >
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={`${folder.name} folder, ${subtitle}`}
          accessibilityHint="Tap to open folder"
          onPress={() => onPress?.(folder)}
          style={[
            styles.container,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: theme.colors.background },
            ]}
          >
            <Ionicons name="folder" size={20} color={theme.colors.accent} />
          </View>
          <View style={styles.info}>
            <Text
              style={[theme.typography.body, styles.name]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {folder.name}
            </Text>
            <Text style={theme.typography.caption}>{subtitle}</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.colors.textSecondary}
          />
        </AccessiblePressable>
      </ReanimatedSwipeable>

      {confirmingDelete ? (
        <CenteredDialog
          title="Delete folder?"
          message={`Remove "${folder.name}"? Tracks inside will be moved out, not deleted.`}
          onDismiss={handleCancelDelete}
        >
          <DialogButton
            label="Delete"
            accessibilityLabel={`Confirm delete ${folder.name}`}
            variant="danger"
            onPress={handleConfirmDelete}
          />
          <DialogButton
            label="Cancel"
            accessibilityLabel="Cancel delete"
            variant="default"
            onPress={handleCancelDelete}
          />
        </CenteredDialog>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
  },
  name: {
    marginBottom: spacing.xs,
  },
  swipeActions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
  swipeAction: {
    width: 56,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginLeft: spacing.xs,
  },
});

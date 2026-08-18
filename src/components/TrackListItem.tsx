import { useRef, useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';
import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';
import { TrackRenameDialog } from './TrackRenameDialog';
import { Track } from '../types';

interface TrackListItemProps {
  track: Track;
  onPress?: (track: Track) => void;
  /**
   * Rename the track to `filename`. Called only with a name that differs from
   * the current one and still carries the original extension.
   */
  onRename?: (id: string, filename: string) => void;
  onDelete?: (id: string) => void;
  onLongPress?: (track: Track) => void;
  style?: ViewStyle;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TrackListItem({
  track,
  onPress,
  onRename,
  onDelete,
  onLongPress,
  style,
}: TrackListItemProps) {
  const { theme } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);
  // Delete confirmation uses the app's own dialog rather than Alert.alert:
  // Alert is a no-op on web, which silently made tracks undeletable there.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);

  function confirmDelete() {
    setConfirmingDelete(true);
  }

  function handleCancelDelete() {
    setConfirmingDelete(false);
    swipeableRef.current?.close();
  }

  function handleConfirmDelete() {
    setConfirmingDelete(false);
    onDelete?.(track.id);
  }

  function handleLongPress() {
    if (onLongPress) {
      onLongPress(track);
      return;
    }
    if (!onDelete) return;
    confirmDelete();
  }

  function startRename() {
    setRenaming(true);
  }

  function handleCancelRename() {
    setRenaming(false);
    swipeableRef.current?.close();
  }

  function handleSaveRename(filename: string) {
    setRenaming(false);
    swipeableRef.current?.close();
    onRename?.(track.id, filename);
  }

  // Built from the actions actually wired up, so the hint never promises a
  // gesture the row does not support.
  function buildHint(): string | undefined {
    const swipeTargets = [onRename && 'rename', onDelete && 'delete'].filter(
      Boolean,
    );
    const parts: string[] = [];
    if (onPress) parts.push('Tap to play');
    if (swipeTargets.length) {
      parts.push(`swipe left to ${swipeTargets.join(' or ')}`);
    }
    if (onDelete) parts.push('long press to delete');
    if (!parts.length) return undefined;
    const hint = parts.join(', ');
    return hint.charAt(0).toUpperCase() + hint.slice(1);
  }

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        {onRename ? (
          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Rename ${track.filename}`}
            onPress={startRename}
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
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.accentText },
              ]}
            >
              Rename
            </Text>
          </AccessiblePressable>
        ) : null}
        {onDelete ? (
          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${track.filename}`}
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
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.errorText },
              ]}
            >
              Delete
            </Text>
          </AccessiblePressable>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={
          onRename || onDelete ? renderRightActions : undefined
        }
        containerStyle={style}
        friction={2}
        rightThreshold={40}
      >
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={`${track.filename}, ${track.durationEstimated ? '~' : ''}${formatDuration(track.durationMs)}, ${track.format.toUpperCase()}`}
          accessibilityHint={buildHint()}
          onLongPress={handleLongPress}
          onPress={() => onPress?.(track)}
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
            <Ionicons
              name="musical-note"
              size={20}
              color={theme.colors.accent}
            />
          </View>
          <View style={styles.info}>
            <Text
              style={[theme.typography.body, styles.filename]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {track.filename}
            </Text>
            <Text style={theme.typography.caption}>
              {track.durationEstimated ? '~' : ''}
              {formatDuration(track.durationMs)} · {track.format.toUpperCase()}{' '}
              · {formatFileSize(track.fileSizeBytes)}
            </Text>
          </View>
        </AccessiblePressable>
      </ReanimatedSwipeable>

      {/* Mounted per open so the rename field re-seeds from the current
          filename each time — see NameEntryDialog's remount contract. */}
      {renaming ? (
        <TrackRenameDialog
          currentFilename={track.filename}
          onSave={handleSaveRename}
          onCancel={handleCancelRename}
        />
      ) : null}

      {confirmingDelete ? (
        <CenteredDialog
          title="Delete track?"
          message={`Remove “${track.filename}” from your library?`}
          onDismiss={handleCancelDelete}
        >
          <DialogButton
            label="Delete"
            accessibilityLabel={`Confirm delete ${track.filename}`}
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
  filename: {
    marginBottom: spacing.xs,
  },
  swipeActions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginLeft: spacing.xs,
    gap: spacing.xs,
  },
  swipeAction: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
});

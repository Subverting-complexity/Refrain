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
import { Track } from '../types';

interface TrackListItemProps {
  track: Track;
  onPress?: (track: Track) => void;
  onDelete?: (id: string) => void;
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
  onDelete,
  style,
}: TrackListItemProps) {
  const { theme } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);
  // Delete confirmation uses the app's own dialog rather than Alert.alert:
  // Alert is a no-op on web, which silently made tracks undeletable there.
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
    onDelete?.(track.id);
  }

  function handleLongPress() {
    if (!onDelete) return;
    confirmDelete();
  }

  function renderRightActions() {
    return (
      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${track.filename}`}
        onPress={confirmDelete}
        style={[styles.swipeDelete, { backgroundColor: theme.colors.error }]}
      >
        <Ionicons
          name="trash-outline"
          size={20}
          color={theme.colors.errorText}
        />
        <Text
          style={[theme.typography.caption, { color: theme.colors.errorText }]}
        >
          Delete
        </Text>
      </AccessiblePressable>
    );
  }

  return (
    <>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={onDelete ? renderRightActions : undefined}
        containerStyle={style}
        friction={2}
        rightThreshold={40}
      >
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={`${track.filename}, ${track.durationEstimated ? '~' : ''}${formatDuration(track.durationMs)}, ${track.format.toUpperCase()}`}
          accessibilityHint={
            onPress && onDelete
              ? 'Tap to play, long press or swipe left to delete'
              : onDelete
                ? 'Long press or swipe left to delete'
                : onPress
                  ? 'Tap to play'
                  : undefined
          }
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
  swipeDelete: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginLeft: spacing.xs,
  },
});

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
  /** Toggle the track's starred state. Wired to the left swipe. */
  onToggleFavorite?: (track: Track) => void;
  onLongPress?: (track: Track) => void;
  style?: ViewStyle;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One track in the library list.
 *
 * Each swipe direction carries exactly one action, so both targets are
 * full-height and full-width. The previous two-button reveal made every
 * target narrow and put a mis-tap next to Delete. Rename is not among them:
 * it is rare, and it does not deserve a prime gesture slot — it lives in the
 * long-press sheet, which is also the only place the rename dialog is
 * mounted, so there is one rename path rather than two.
 */
export function TrackListItem({
  track,
  onPress,
  onDelete,
  onToggleFavorite,
  onLongPress,
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
    if (onLongPress) {
      onLongPress(track);
      return;
    }
    if (!onDelete) return;
    confirmDelete();
  }

  function handleToggleFavorite() {
    swipeableRef.current?.close();
    onToggleFavorite?.(track);
  }

  // Built from the actions actually wired up, so the hint never promises a
  // gesture the row does not support.
  function buildHint(): string | undefined {
    const parts: string[] = [];
    if (onPress) parts.push('Tap to play');
    if (onToggleFavorite) {
      parts.push(
        `swipe left to ${track.isFavorite ? 'unfavourite' : 'favourite'}`,
      );
    }
    if (onDelete) parts.push('swipe right to delete');
    if (onLongPress) parts.push('long press for more');
    else if (onDelete) parts.push('long press to delete');
    if (!parts.length) return undefined;
    const hint = parts.join(', ');
    return hint.charAt(0).toUpperCase() + hint.slice(1);
  }

  function renderLeftActions() {
    return (
      <View style={styles.swipeActions}>
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={`${track.isFavorite ? 'Unfavourite' : 'Favourite'} ${track.filename}`}
          onPress={handleToggleFavorite}
          style={[styles.swipeAction, { backgroundColor: theme.colors.accent }]}
        >
          <Ionicons
            name={track.isFavorite ? 'star' : 'star-outline'}
            size={20}
            color={theme.colors.accentText}
          />
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.accentText },
            ]}
          >
            {track.isFavorite ? 'Unfavourite' : 'Favourite'}
          </Text>
        </AccessiblePressable>
      </View>
    );
  }

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${track.filename}`}
          onPress={confirmDelete}
          style={[styles.swipeAction, { backgroundColor: theme.colors.error }]}
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
      </View>
    );
  }

  return (
    <>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderLeftActions={onToggleFavorite ? renderLeftActions : undefined}
        renderRightActions={onDelete ? renderRightActions : undefined}
        containerStyle={style}
        friction={2}
        leftThreshold={40}
        rightThreshold={40}
      >
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={`${track.filename}, ${track.durationEstimated ? '~' : ''}${formatDuration(track.durationMs)}, ${track.format.toUpperCase()}${track.isFavorite ? ', favourite' : ''}`}
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
          {/* Starred state is visible without swiping, so the list answers
              "which of these are favourites" at a glance. Decorative: the
              row's own label already announces it. */}
          {track.isFavorite ? (
            <Ionicons
              name="star"
              size={16}
              color={theme.colors.accent}
              style={styles.star}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : null}
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
  star: {
    marginLeft: spacing.sm,
  },
  swipeActions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginHorizontal: spacing.xs,
  },
  // One action per direction, so it takes the whole reveal rather than
  // sharing it with a neighbour a mis-tap could reach.
  swipeAction: {
    width: 96,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: radii.sm,
  },
});

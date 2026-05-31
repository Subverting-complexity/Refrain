import { useState } from 'react';
import { Alert, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';
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
  const [showDelete, setShowDelete] = useState(false);

  function handleLongPress() {
    if (!onDelete) return;
    setShowDelete(true);
  }

  function handleDeletePress() {
    Alert.alert('Delete Track', `Remove "${track.filename}" from library?`, [
      { text: 'Cancel', style: 'cancel', onPress: () => setShowDelete(false) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDelete?.(track.id),
      },
    ]);
  }

  return (
    <AccessiblePressable
      accessibilityRole="button"
      accessibilityLabel={`${track.filename}, ~${formatDuration(track.durationMs)}, ${track.format.toUpperCase()}`}
      accessibilityHint={
        onPress && onDelete
          ? 'Tap to play, long press to delete'
          : onDelete
            ? 'Long press to delete'
            : onPress
              ? 'Tap to play'
              : undefined
      }
      onLongPress={handleLongPress}
      onPress={() => {
        if (showDelete) {
          setShowDelete(false);
        } else {
          onPress?.(track);
        }
      }}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Ionicons name="musical-note" size={20} color={theme.colors.accent} />
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
          ~{formatDuration(track.durationMs)} · {track.format.toUpperCase()} ·{' '}
          {formatFileSize(track.fileSizeBytes)}
        </Text>
      </View>
      {showDelete && (
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${track.filename}`}
          onPress={handleDeletePress}
          style={[styles.deleteButton, { backgroundColor: theme.colors.error }]}
        >
          <Ionicons
            name="trash-outline"
            size={18}
            color={theme.colors.errorText}
          />
        </AccessiblePressable>
      )}
    </AccessiblePressable>
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
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    marginLeft: spacing.sm,
  },
});

import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { Track } from '../types';

interface TrackListItemProps {
  track: Track;
  style?: ViewStyle;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TrackListItem({ track, style }: TrackListItemProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        style,
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`${track.filename}, ${formatDuration(track.durationMs)}, ${track.format.toUpperCase()}`}
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
          {formatDuration(track.durationMs)} · {track.format.toUpperCase()} ·{' '}
          {formatFileSize(track.fileSizeBytes)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
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
});

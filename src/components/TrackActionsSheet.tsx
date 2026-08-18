import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { Track } from '../types';
import { AccessiblePressable } from './AccessiblePressable';
import { CenteredDialog } from './CenteredDialog';

function ActionRow({
  icon,
  label,
  onPress,
  disabled,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  const { theme } = useTheme();

  return (
    <AccessiblePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={(state) => [
        styles.row,
        {
          opacity: disabled ? 0.4 : state.pressed ? 0.7 : 1,
          borderColor: theme.colors.border,
        },
      ]}
      disabled={disabled}
    >
      <Ionicons
        name={icon}
        size={20}
        color={color ?? theme.colors.textPrimary}
        style={styles.icon}
      />
      <Text
        style={[
          theme.typography.body,
          { color: color ?? theme.colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </AccessiblePressable>
  );
}

export interface TrackActionsSheetProps {
  track: Track;
  onRename: () => void;
  onMoveToFolder: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

export function TrackActionsSheet({
  track,
  onRename,
  onMoveToFolder,
  onDelete,
  onDismiss,
}: TrackActionsSheetProps) {
  const { theme } = useTheme();

  return (
    <CenteredDialog title={track.filename} onDismiss={onDismiss}>
      <ActionRow
        icon="pencil-outline"
        label="Rename"
        onPress={() => {
          onDismiss();
          onRename();
        }}
      />
      <ActionRow
        icon="folder-outline"
        label="Move to folder…"
        onPress={() => {
          onDismiss();
          onMoveToFolder();
        }}
      />
      <ActionRow
        icon="trash-outline"
        label="Delete"
        onPress={() => {
          onDismiss();
          onDelete();
        }}
        color={theme.colors.error}
      />
    </CenteredDialog>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    marginRight: spacing.md,
  },
});

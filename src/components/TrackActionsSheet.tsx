import { useTheme } from '../hooks/useTheme';
import { Track } from '../types';
import { ActionRow } from './ActionRow';
import { CenteredDialog } from './CenteredDialog';

export interface TrackActionsSheetProps {
  track: Track;
  onRename: () => void;
  onToggleFavorite: () => void;
  onMoveToFolder: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

/**
 * The track long-press menu.
 *
 * Move up and Move down are deliberately absent: manual track order is gone,
 * because a hand-sorted list stops being maintainable long before a library
 * reaches the size Refrain is built for. "Move to folder…" is the only way
 * to relocate a track.
 */
export function TrackActionsSheet({
  track,
  onRename,
  onToggleFavorite,
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
        icon={track.isFavorite ? 'star' : 'star-outline'}
        label={track.isFavorite ? 'Unfavourite' : 'Favourite'}
        onPress={() => {
          onDismiss();
          onToggleFavorite();
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

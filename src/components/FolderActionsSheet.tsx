import { useTheme } from '../hooks/useTheme';
import { ActionRow } from './ActionRow';
import { CenteredDialog } from './CenteredDialog';

export interface FolderActionsSheetProps {
  name: string;
  pinned: boolean;
  /** Both false for an unpinned folder: there is no MRU order to rearrange. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onTogglePin: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

/**
 * The folder action menu, mirroring {@link TrackActionsSheet} in shape and
 * in how it is reached, so both row types answer the same way. Rows open it
 * from the actions button or a long press — the button is what makes these
 * actions reachable with a mouse, where long press is undiscoverable.
 *
 * Move up and Move down are the *accessible* reordering path, not a fallback
 * for one: dragging is unusable with a screen reader, so reordering must
 * never be gated behind the drag gesture. They apply only inside the pinned
 * block — unpinned folders are ordered by when they were last opened, and
 * there is nothing there to rearrange by hand.
 *
 * The three built-in entries never reach this sheet. They are saved queries
 * rather than records, so there is nothing to pin, rename or delete.
 */
export function FolderActionsSheet({
  name,
  pinned,
  canMoveUp,
  canMoveDown,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
  onDismiss,
}: FolderActionsSheetProps) {
  const { theme } = useTheme();

  return (
    <CenteredDialog title={name} onDismiss={onDismiss}>
      <ActionRow
        icon={pinned ? 'pin' : 'pin-outline'}
        label={pinned ? 'Unpin' : 'Pin'}
        onPress={() => {
          onDismiss();
          onTogglePin();
        }}
      />
      <ActionRow
        icon="arrow-up-outline"
        label="Move up"
        disabled={!canMoveUp}
        onPress={() => {
          onDismiss();
          onMoveUp();
        }}
      />
      <ActionRow
        icon="arrow-down-outline"
        label="Move down"
        disabled={!canMoveDown}
        onPress={() => {
          onDismiss();
          onMoveDown();
        }}
      />
      <ActionRow
        icon="pencil-outline"
        label="Rename"
        onPress={() => {
          onDismiss();
          onRename();
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

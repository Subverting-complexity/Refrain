import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { SegmentProfile } from '../types';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';
import { BottomSheet } from './BottomSheet';
import { CenteredDialog } from './CenteredDialog';
import { DialogButton } from './DialogButton';
import { SegmentRenameDialog } from './SegmentRenameDialog';
import { SnippetPreviewSettings } from './SnippetPreviewSettings';

export interface SegmentProfileSheetProps {
  /** The track's saved profiles, in stable (oldest-first) order. */
  profiles: SegmentProfile[];
  /** Apply a saved profile to the player (sets markers + loop). */
  onLoadProfile: (profile: SegmentProfile) => void;
  /** Rename a profile by id. */
  onRename: (profileId: string, name: string) => void;
  /** Delete a profile by id. */
  onRemove: (profileId: string) => void;
  /** Whether marker-drag snippet preview is enabled. */
  snippetPreviewEnabled: boolean;
  /** Toggle marker-drag snippet preview. */
  onSnippetPreviewChange: (enabled: boolean) => void;
  /** Dismiss the sheet. */
  onClose: () => void;
}

/**
 * Bottom-sheet surface for managing a track's named A/B segment profiles:
 * load a saved one (which arms its markers via the player and auto-persists),
 * rename, and delete. Saving is now done from the player, where markers are
 * edited; this sheet is load + rename + delete only.
 */
export function SegmentProfileSheet({
  profiles,
  onLoadProfile,
  onRename,
  onRemove,
  snippetPreviewEnabled,
  onSnippetPreviewChange,
  onClose,
}: SegmentProfileSheetProps) {
  const { theme } = useTheme();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const renamingProfile = profiles.find((p) => p.id === renamingId) ?? null;
  const confirmingProfile = profiles.find((p) => p.id === confirmingId) ?? null;

  const startRename = (profile: SegmentProfile) => {
    setConfirmingId(null);
    setRenamingId(profile.id);
  };

  const confirmRename = (name: string) => {
    if (renamingId) onRename(renamingId, name);
    setRenamingId(null);
  };

  const startDelete = (profile: SegmentProfile) => {
    setRenamingId(null);
    setConfirmingId(profile.id);
  };

  const confirmDelete = () => {
    if (confirmingId) onRemove(confirmingId);
    setConfirmingId(null);
  };

  const loadProfile = (profile: SegmentProfile) => {
    onLoadProfile(profile);
    onClose();
  };

  return (
    <BottomSheet
      title="Segments"
      onClose={onClose}
      closeLabel="Close segment profiles"
    >
      <SnippetPreviewSettings
        enabled={snippetPreviewEnabled}
        onChange={onSnippetPreviewChange}
      />
      <View style={[styles.divider, { backgroundColor: theme.colors.track }]} />

      {profiles.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="bookmark-outline"
            size={40}
            color={theme.colors.textSecondary}
          />
          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.textSecondary },
            ]}
          >
            No saved segments yet
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {profiles.map((profile) => {
            return (
              <View key={profile.id} style={styles.row}>
                <AccessiblePressable
                  accessibilityRole="button"
                  accessibilityLabel={`Load segment ${profile.name}`}
                  onPress={() => loadProfile(profile)}
                  style={styles.loadArea}
                >
                  <Text
                    style={[
                      theme.typography.body,
                      { color: theme.colors.textPrimary },
                    ]}
                    numberOfLines={1}
                  >
                    {profile.name}
                  </Text>
                  <Text
                    style={[
                      theme.typography.caption,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {formatDuration(profile.markerA ?? 0)} –{' '}
                    {formatDuration(profile.markerB ?? 0)}
                    {profile.loopEnabled ? ' · Loop' : ''}
                  </Text>
                </AccessiblePressable>
                <AccessiblePressable
                  accessibilityRole="button"
                  accessibilityLabel={`Rename ${profile.name}`}
                  onPress={() => startRename(profile)}
                >
                  <Ionicons
                    name="pencil"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </AccessiblePressable>
                <AccessiblePressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${profile.name}`}
                  onPress={() => startDelete(profile)}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </AccessiblePressable>
              </View>
            );
          })}
        </View>
      )}
      {renamingProfile ? (
        <SegmentRenameDialog
          currentName={renamingProfile.name}
          onSave={confirmRename}
          onCancel={() => setRenamingId(null)}
        />
      ) : null}
      {/* Same confirm affordance as track deletion (TrackListItem): the
          app-wide CenteredDialog, not an inline row swap, so destructive
          confirmation looks and behaves identically everywhere. */}
      {confirmingProfile ? (
        <CenteredDialog
          title="Delete segment?"
          message={`Remove “${confirmingProfile.name}” from this track?`}
          onDismiss={() => setConfirmingId(null)}
        >
          <DialogButton
            label="Delete"
            accessibilityLabel={`Confirm delete ${confirmingProfile.name}`}
            variant="danger"
            onPress={confirmDelete}
          />
          <DialogButton
            label="Cancel"
            accessibilityLabel="Cancel delete"
            variant="default"
            onPress={() => setConfirmingId(null)}
          />
        </CenteredDialog>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadArea: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
});

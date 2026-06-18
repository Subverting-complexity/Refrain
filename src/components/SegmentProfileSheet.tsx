import { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSegmentProfiles } from '../hooks/useSegmentProfiles';
import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { SegmentProfile } from '../types';
import { formatDuration } from '../utils/formatTime';
import { nextSegmentName } from '../utils/nextSegmentName';
import { AccessiblePressable } from './AccessiblePressable';

export interface SegmentProfileSheetProps {
  /** The track whose profiles are managed. */
  trackId: string;
  /** Current A marker, captured when saving a new profile. */
  markerA: number | null;
  /** Current B marker, captured when saving a new profile. */
  markerB: number | null;
  /** Current loop flag, captured when saving a new profile. */
  loopEnabled: boolean;
  /** Apply a saved profile to the player (sets markers + loop). */
  onLoadProfile: (profile: SegmentProfile) => void;
  /** Dismiss the sheet. */
  onClose: () => void;
}

/**
 * Bottom-sheet surface for managing a track's named A/B segment profiles:
 * save the current region as a new profile, load a saved one (which applies
 * its markers via the player and auto-persists), rename, and delete. Mounted
 * only while open, so the underlying profile store is read only on demand.
 */
export function SegmentProfileSheet({
  trackId,
  markerA,
  markerB,
  loopEnabled,
  onLoadProfile,
  onClose,
}: SegmentProfileSheetProps) {
  const { theme } = useTheme();
  const { profiles, save, rename, remove } = useSegmentProfiles(trackId);

  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Saving captures the live region, so it is only offered when both markers
  // are set (a valid A/B loop). Without that there is nothing to store.
  const canSave = markerA != null && markerB != null;

  const resetRowState = () => {
    setRenamingId(null);
    setConfirmingId(null);
  };

  const openSave = () => {
    resetRowState();
    setDraftName(nextSegmentName(profiles));
    setSaving(true);
  };

  const confirmSave = () => {
    const name = draftName.trim() || nextSegmentName(profiles);
    save({ name, markerA, markerB, loopEnabled });
    setSaving(false);
  };

  const startRename = (profile: SegmentProfile) => {
    setSaving(false);
    setConfirmingId(null);
    setRenameDraft(profile.name);
    setRenamingId(profile.id);
  };

  const confirmRename = () => {
    if (renamingId) {
      const name = renameDraft.trim();
      if (name) rename(renamingId, name);
    }
    setRenamingId(null);
  };

  const startDelete = (profile: SegmentProfile) => {
    setSaving(false);
    setRenamingId(null);
    setConfirmingId(profile.id);
  };

  const confirmDelete = () => {
    if (confirmingId) remove(confirmingId);
    setConfirmingId(null);
  };

  const loadProfile = (profile: SegmentProfile) => {
    onLoadProfile(profile);
    onClose();
  };

  const inputStyle = [
    styles.input,
    theme.typography.body,
    { color: theme.colors.textPrimary, borderColor: theme.colors.border },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <AccessiblePressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Close segment profiles"
          onPress={onClose}
        />

        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.header}>
            <Text
              style={[
                theme.typography.heading,
                { color: theme.colors.textPrimary },
              ]}
            >
              Segments
            </Text>
            <AccessiblePressable
              accessibilityRole="button"
              accessibilityLabel="Close segment profiles"
              onPress={onClose}
            >
              <Ionicons
                name="close"
                size={24}
                color={theme.colors.textSecondary}
              />
            </AccessiblePressable>
          </View>

          {saving ? (
            <View style={styles.saveRow}>
              <TextInput
                accessibilityLabel="New segment name"
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Segment name"
                placeholderTextColor={theme.colors.textSecondary}
                style={inputStyle}
                autoFocus
              />
              <AccessiblePressable
                accessibilityRole="button"
                accessibilityLabel="Confirm save segment"
                onPress={confirmSave}
              >
                <Ionicons
                  name="checkmark"
                  size={22}
                  color={theme.colors.accent}
                />
              </AccessiblePressable>
              <AccessiblePressable
                accessibilityRole="button"
                accessibilityLabel="Cancel save segment"
                onPress={() => setSaving(false)}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={theme.colors.textSecondary}
                />
              </AccessiblePressable>
            </View>
          ) : (
            <AccessiblePressable
              accessibilityRole="button"
              accessibilityLabel="Save current segment"
              accessibilityState={{ disabled: !canSave }}
              accessibilityHint={
                canSave ? undefined : 'Set both loop markers first'
              }
              disabled={!canSave}
              onPress={openSave}
              style={(state) => [
                styles.saveButton,
                {
                  borderColor: theme.colors.accent,
                  opacity: !canSave ? 0.4 : state.pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="add" size={20} color={theme.colors.accent} />
              <Text
                style={[theme.typography.body, { color: theme.colors.accent }]}
              >
                Save current segment
              </Text>
            </AccessiblePressable>
          )}

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
                if (renamingId === profile.id) {
                  return (
                    <View key={profile.id} style={styles.saveRow}>
                      <TextInput
                        accessibilityLabel="Segment name"
                        value={renameDraft}
                        onChangeText={setRenameDraft}
                        style={inputStyle}
                        autoFocus
                      />
                      <AccessiblePressable
                        accessibilityRole="button"
                        accessibilityLabel="Confirm rename"
                        onPress={confirmRename}
                      >
                        <Ionicons
                          name="checkmark"
                          size={22}
                          color={theme.colors.accent}
                        />
                      </AccessiblePressable>
                      <AccessiblePressable
                        accessibilityRole="button"
                        accessibilityLabel="Cancel rename"
                        onPress={() => setRenamingId(null)}
                      >
                        <Ionicons
                          name="close"
                          size={22}
                          color={theme.colors.textSecondary}
                        />
                      </AccessiblePressable>
                    </View>
                  );
                }

                if (confirmingId === profile.id) {
                  return (
                    <View key={profile.id} style={styles.row}>
                      <Text
                        style={[
                          theme.typography.body,
                          styles.rowName,
                          { color: theme.colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        Delete “{profile.name}”?
                      </Text>
                      <AccessiblePressable
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm delete ${profile.name}`}
                        onPress={confirmDelete}
                      >
                        <Ionicons
                          name="trash"
                          size={20}
                          color={theme.colors.error}
                        />
                      </AccessiblePressable>
                      <AccessiblePressable
                        accessibilityRole="button"
                        accessibilityLabel="Cancel delete"
                        onPress={() => setConfirmingId(null)}
                      >
                        <Ionicons
                          name="close"
                          size={22}
                          color={theme.colors.textSecondary}
                        />
                      </AccessiblePressable>
                    </View>
                  );
                }

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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.sm,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  rowName: {
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
});

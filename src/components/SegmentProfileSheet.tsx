import { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { SegmentProfile } from '../types';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';

export interface SegmentProfileSheetProps {
  /** The track's saved profiles, in stable (oldest-first) order. */
  profiles: SegmentProfile[];
  /** Apply a saved profile to the player (sets markers + loop). */
  onLoadProfile: (profile: SegmentProfile) => void;
  /** Rename a profile by id. */
  onRename: (profileId: string, name: string) => void;
  /** Delete a profile by id. */
  onRemove: (profileId: string) => void;
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
  onClose,
}: SegmentProfileSheetProps) {
  const { theme } = useTheme();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const startRename = (profile: SegmentProfile) => {
    setConfirmingId(null);
    setRenameDraft(profile.name);
    setRenamingId(profile.id);
  };

  const confirmRename = () => {
    if (renamingId) {
      const name = renameDraft.trim();
      if (name) onRename(renamingId, name);
    }
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

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { SegmentProfile } from '../types';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';
import { BottomSheet } from './BottomSheet';
import { SnippetPreviewSettings } from './SnippetPreviewSettings';

export interface SegmentProfileSheetProps {
  /** The track's saved profiles, in stable (oldest-first) order. */
  profiles: SegmentProfile[];
  /** Apply a saved profile to the player (sets markers + loop). */
  onLoadProfile: (profile: SegmentProfile) => void;
  /** Ask the player to open the rename dialog for a profile. */
  onRequestRename: (profile: SegmentProfile) => void;
  /** Ask the player to open the delete confirmation for a profile. */
  onRequestDelete: (profile: SegmentProfile) => void;
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
 * or ask for one to be renamed or deleted. Saving is done from the player,
 * where markers are edited.
 *
 * The rename and delete dialogs are deliberately *not* rendered here. This
 * sheet is a `Modal`, and on Android every `Modal` is its own window, so a
 * dialog rendered inside it opened a window nested in the sheet's own: the
 * card was laid out against different bounds and the hardware back button had
 * two `onRequestClose` handlers to choose between (#316). The player owns both
 * dialogs and renders them as siblings of this sheet; the sheet only reports
 * which profile the user pointed at.
 */
export function SegmentProfileSheet({
  profiles,
  onLoadProfile,
  onRequestRename,
  onRequestDelete,
  snippetPreviewEnabled,
  onSnippetPreviewChange,
  onClose,
}: SegmentProfileSheetProps) {
  const { theme } = useTheme();

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
                  onPress={() => onRequestRename(profile)}
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
                  onPress={() => onRequestDelete(profile)}
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

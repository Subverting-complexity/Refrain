import { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { SegmentProfile } from '../types';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';
import { BottomSheet } from './BottomSheet';
import { SnippetPreviewSettings } from './SnippetPreviewSettings';

/**
 * Whether a dialog shown over this sheet is mounted *inside* the sheet's
 * `Modal` (`true`) or beside it (`false`). Both placements are forced, in opposite directions, so
 * this is a platform decision rather than a preference.
 *
 * Android renders every `Modal` as its own window. A dialog rendered inside
 * the sheet therefore opened a window nested in the sheet's own: the two
 * disagreed about translucency so the card was centred against different
 * bounds, and the hardware back button had two `onRequestClose` handlers
 * competing across two windows (#316). It has to be a sibling.
 *
 * iOS presents a `Modal` from the nearest view controller up the responder
 * chain. Two sibling `Modal`s both resolve to the root one, which is already
 * presenting the sheet, so UIKit refuses the second presentation and the
 * dialog never appears. Nesting is what makes it present, and it costs
 * nothing there: a nested `Modal` is a sibling view in the same window, which
 * is why none of #316's symptoms show up on iOS in the first place.
 *
 * Web has neither constraint; it keeps the iOS placement so the two platforms
 * this change is not about stay exactly as they were.
 *
 * Read per render rather than once at module load, so the branch is reachable
 * in a test that swaps `Platform.OS`.
 */
function nestDialogInSheet(): boolean {
  return Platform.OS !== 'android';
}

export interface SegmentProfileSheetProps {
  /** The track's saved profiles, in stable (oldest-first) order. */
  profiles: SegmentProfile[];
  /** Apply a saved profile to the player (sets markers + loop). */
  onLoadProfile: (profile: SegmentProfile) => void;
  /** Ask the player to open the rename dialog for a profile. */
  onRequestRename: (profile: SegmentProfile) => void;
  /** Ask the player to open the delete confirmation for a profile. */
  onRequestDelete: (profile: SegmentProfile) => void;
  /**
   * The rename or delete dialog to show over this sheet, or nothing. The
   * player owns it — this sheet only decides where it may be mounted, which
   * differs by platform.
   */
  dialog?: ReactNode;
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
 * The player owns the rename and delete dialogs; this sheet reports which
 * profile the user pointed at and places the dialog it is handed. See
 * {@link nestDialogInSheet} for why the placement is not the same on every platform.
 */
export function SegmentProfileSheet({
  profiles,
  onLoadProfile,
  onRequestRename,
  onRequestDelete,
  dialog,
  snippetPreviewEnabled,
  onSnippetPreviewChange,
  onClose,
}: SegmentProfileSheetProps) {
  const { theme } = useTheme();
  const nestDialog = nestDialogInSheet();

  const loadProfile = (profile: SegmentProfile) => {
    onLoadProfile(profile);
    onClose();
  };

  return (
    <>
      <BottomSheet
        title="Segments"
        onClose={onClose}
        closeLabel="Close segment profiles"
      >
        <SnippetPreviewSettings
          enabled={snippetPreviewEnabled}
          onChange={onSnippetPreviewChange}
        />
        <View
          style={[styles.divider, { backgroundColor: theme.colors.track }]}
        />

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
        {nestDialog ? dialog : null}
      </BottomSheet>
      {nestDialog ? null : dialog}
    </>
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

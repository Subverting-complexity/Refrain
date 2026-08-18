import { ComponentProps, useRef } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * A row on the library root. Two kinds of row share it: a real folder, which
 * can be renamed and deleted by swiping, and a built-in entry (All tracks,
 * Favourites, Unfiled), which is a saved query rather than a record and so
 * offers no actions at all.
 *
 * The component is deliberately told its name, count and icon rather than
 * handed a `Folder`, because the built-in entries have no folder row behind
 * them to hand over.
 */
export interface FolderListItemProps {
  name: string;
  trackCount: number;
  /**
   * Which sort of row this is. It decides the default icon, how the row
   * reads to a screen reader, and nothing else — a built-in row is kept
   * actionless by its caller simply not passing `onRename` or `onDelete`.
   */
  kind?: 'folder' | 'builtin';
  /**
   * Overrides the default glyph. Built-in entries pass their own so they do
   * not read as editable folders sitting in the same list.
   */
  icon?: IoniconName;
  onPress?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  /**
   * Opens the folder action sheet. Built-in rows do not pass it, which is
   * what keeps them free of a long-press menu.
   */
  onLongPress?: () => void;
  /** Shows the pin marker. Pinned rows sit above the MRU-ordered ones. */
  pinned?: boolean;
  style?: ViewStyle;
}

export function FolderListItem({
  name,
  trackCount,
  kind = 'folder',
  icon,
  onPress,
  onDelete,
  onRename,
  onLongPress,
  pinned = false,
  style,
}: FolderListItemProps) {
  const { theme } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);

  // The delete confirmation belongs to the screen, not to the row. It has to
  // name where the tracks are going and how many there are, and the tally is
  // the screen's — keeping one dialog there beats a second copy here that
  // could only ask a vaguer question.
  function requestDelete() {
    swipeableRef.current?.close();
    onDelete?.();
  }

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        {onRename ? (
          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Rename ${name}`}
            onPress={() => {
              swipeableRef.current?.close();
              onRename();
            }}
            style={[
              styles.swipeAction,
              { backgroundColor: theme.colors.accent },
            ]}
          >
            <Ionicons
              name="pencil-outline"
              size={20}
              color={theme.colors.accentText}
            />
          </AccessiblePressable>
        ) : null}
        {onDelete ? (
          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${name}`}
            onPress={requestDelete}
            style={[
              styles.swipeAction,
              { backgroundColor: theme.colors.error },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={theme.colors.errorText}
            />
          </AccessiblePressable>
        ) : null}
      </View>
    );
  }

  const subtitle = trackCount === 1 ? '1 track' : `${trackCount} tracks`;
  const label = [
    kind === 'folder' ? `${name} folder` : name,
    pinned ? 'pinned' : null,
    subtitle,
  ]
    .filter(Boolean)
    .join(', ');
  const hint =
    kind === 'folder'
      ? onLongPress
        ? 'Tap to open folder, long press for more'
        : 'Tap to open folder'
      : 'Tap to view these tracks';

  return (
    <>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={
          onDelete || onRename ? renderRightActions : undefined
        }
        containerStyle={style}
        friction={2}
        rightThreshold={40}
      >
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={hint}
          onPress={() => onPress?.()}
          onLongPress={onLongPress}
          style={[
            styles.container,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: theme.colors.background },
            ]}
          >
            <Ionicons
              name={icon ?? 'folder'}
              size={20}
              color={theme.colors.accent}
            />
          </View>
          <View style={styles.info}>
            <Text
              style={[theme.typography.body, styles.name]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {name}
            </Text>
            <Text style={theme.typography.caption}>{subtitle}</Text>
          </View>
          {pinned ? (
            <Ionicons
              name="pin"
              size={14}
              color={theme.colors.accent}
              style={styles.pin}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : null}
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.colors.textSecondary}
          />
        </AccessiblePressable>
      </ReanimatedSwipeable>
    </>
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
  name: {
    marginBottom: spacing.xs,
  },
  pin: {
    marginRight: spacing.xs,
  },
  swipeActions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
  swipeAction: {
    width: 56,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginLeft: spacing.xs,
  },
});

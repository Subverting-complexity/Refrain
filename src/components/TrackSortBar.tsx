import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { SortKey, SortOption } from '../types';
import { invert, NATURAL_DIRECTION, selectKey } from '../utils/librarySort';
import { AccessiblePressable } from './AccessiblePressable';
import { CHIP_HIT_SLOP, chipStyles, pillColors } from './chipStyles';

const CHIP_MIN_HEIGHT = 30;

interface SortChip {
  key: SortKey;
  /**
   * A static noun. The label never rewrites itself — a chip that reads
   * "Longest first" one moment and "Shortest first" the next makes the row
   * jump about and forces a re-read to find the one you want. Direction is
   * carried by the chevron instead.
   */
  label: string;
  /** How each direction reads aloud, for the accessibility label. */
  ascendingAs: string;
  descendingAs: string;
}

const SORT_CHIPS: readonly SortChip[] = [
  {
    key: 'added',
    label: 'Added',
    ascendingAs: 'oldest first',
    descendingAs: 'newest first',
  },
  {
    key: 'played',
    label: 'Played',
    ascendingAs: 'least recent first',
    descendingAs: 'most recent first',
  },
  {
    key: 'name',
    label: 'Name',
    ascendingAs: 'A to Z',
    descendingAs: 'Z to A',
  },
  {
    key: 'length',
    label: 'Length',
    ascendingAs: 'shortest first',
    descendingAs: 'longest first',
  },
];

interface TrackSortBarProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  /**
   * The favourites filter. Omitted inside the Favourites view, where it
   * would be a no-op.
   */
  favoritesOnly?: boolean;
  onToggleFavorites?: () => void;
  showFavoritesFilter?: boolean;
  style?: ViewStyle;
}

/**
 * The track list's ordering control: four chips, each a static noun, with a
 * chevron on the active one showing which way it runs.
 *
 * Tapping the active chip reverses it; tapping any other switches to it at
 * its own natural default. Both are one gesture, which is the point — the
 * modal this replaces cost a round trip through nine rows to change one
 * thing.
 *
 * The favourites star sits at the right, deliberately outside the chip
 * group: it filters rather than sorts, and conflating the two would suggest
 * tapping it reorders the list.
 *
 * This shares `chipStyles`, `pillColors` and the hit slop with `ChipGroup`
 * but renders its own chips rather than using it. `ChipGroup` is a
 * single-select radio group: it hardcodes `accessibilityRole="radio"`,
 * builds every label from one `${prefix} ${label}` template, and has no room
 * for a child element. These chips need a button role (tapping the selected
 * one changes it, which a radio never does), a per-chip label naming both
 * the direction and what a tap will do, and a chevron inside the pill. The
 * visual recipe is shared; the behaviour genuinely differs.
 */
export function TrackSortBar({
  value,
  onChange,
  favoritesOnly = false,
  onToggleFavorites,
  showFavoritesFilter = false,
  style,
}: TrackSortBarProps) {
  const { theme } = useTheme();
  const starColors = pillColors(theme, favoritesOnly);

  return (
    <View style={[styles.row, style]}>
      <View style={styles.chips}>
        {SORT_CHIPS.map((chip) => {
          const active = value.key === chip.key;
          const direction = active
            ? value.direction
            : NATURAL_DIRECTION[chip.key];
          const colors = pillColors(theme, active);
          const reads =
            direction === 'asc' ? chip.ascendingAs : chip.descendingAs;

          return (
            <AccessiblePressable
              key={chip.key}
              accessibilityRole="button"
              // Announce both the current state and what a tap will do. A
              // chip that silently reverses is a bug report.
              accessibilityLabel={
                active
                  ? `${chip.label}, sorted ${reads}, double tap to reverse`
                  : `${chip.label}, double tap to sort ${reads}`
              }
              accessibilityState={{ selected: active }}
              onPress={() =>
                onChange(active ? invert(value) : selectKey(chip.key))
              }
              hitSlop={CHIP_HIT_SLOP}
              style={[
                chipStyles.pill,
                styles.chip,
                {
                  backgroundColor: colors.backgroundColor,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              <Text
                style={[chipStyles.pillText, { color: colors.textColor }]}
                numberOfLines={1}
              >
                {chip.label}
              </Text>
              {active ? (
                <Ionicons
                  name={direction === 'asc' ? 'chevron-up' : 'chevron-down'}
                  size={12}
                  color={colors.textColor}
                  style={styles.chevron}
                />
              ) : null}
            </AccessiblePressable>
          );
        })}
      </View>

      {showFavoritesFilter && onToggleFavorites ? (
        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={
            favoritesOnly
              ? 'Showing favourites only, double tap to show all tracks'
              : 'Show favourites only'
          }
          accessibilityState={{ selected: favoritesOnly }}
          onPress={onToggleFavorites}
          hitSlop={CHIP_HIT_SLOP}
          style={[
            chipStyles.pill,
            styles.star,
            {
              backgroundColor: starColors.backgroundColor,
              borderColor: starColors.borderColor,
            },
          ]}
        >
          <Ionicons
            name={favoritesOnly ? 'star' : 'star-outline'}
            size={14}
            color={starColors.textColor}
          />
        </AccessiblePressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Four chips plus a star is tight on a 375pt screen. The chips share the
  // flexible space and the star keeps its own, so the star stays reachable
  // rather than being pushed off the end.
  chips: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: CHIP_MIN_HEIGHT,
    paddingHorizontal: spacing.sm,
    // Four chips plus a star is already tight on a 375pt screen, and OS font
    // scaling makes it tighter. Let them give way rather than overflow the
    // row and push the star off the end where it cannot be reached.
    flexShrink: 1,
  },
  chevron: {
    marginLeft: spacing.xs,
  },
  star: {
    minHeight: CHIP_MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
});

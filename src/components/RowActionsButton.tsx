import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

export interface RowActionsButtonProps {
  /**
   * Names the row the menu belongs to, not the control — a list of rows all
   * labelled "More actions" is unnavigable by screen reader.
   */
  rowName: string;
  onPress: () => void;
}

/**
 * The visible way into a row's action sheet.
 *
 * Every action a folder or track row offers — rename, pin, move to folder —
 * used to be reachable only by long press or swipe. Both are touch idioms
 * that a mouse either cannot express or expresses only by accident: nobody
 * discovers a menu by holding a mouse button down on a list row, so on web
 * the whole sheet was effectively unreachable. This button is the affordance
 * those gestures never were — it is drawn on the row, it is a focusable
 * element in its own right, and it answers a plain click or tap.
 *
 * It sits *beside* the row's own pressable rather than inside it. Nesting
 * would put a click target inside a click target, and on web the inner
 * click bubbles: pressing the menu would also open the row behind it.
 */
export function RowActionsButton({ rowName, onPress }: RowActionsButtonProps) {
  const { theme } = useTheme();

  return (
    <AccessiblePressable
      accessibilityRole="button"
      accessibilityLabel={`More actions for ${rowName}`}
      onPress={onPress}
      style={(state) => [styles.button, { opacity: state.pressed ? 0.6 : 1 }]}
    >
      <Ionicons
        name="ellipsis-vertical"
        size={18}
        color={theme.colors.textSecondary}
      />
    </AccessiblePressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // Width and height come from AccessiblePressable's 44pt floor; this only
    // keeps the glyph off the row's right edge.
    paddingHorizontal: spacing.xs,
  },
});

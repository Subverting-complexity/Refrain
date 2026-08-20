/**
 * Shared chrome for the library's list rows (tracks and folders), which are
 * deliberately styled as one family.
 *
 * The row's border sits on the outer container rather than on the pressable,
 * because the actions button is a sibling of that pressable and both belong
 * inside one border. Nesting a click target inside a click target would, on
 * web, fire the row underneath as well as the menu.
 *
 * `main` keeps a small right padding: with the row's own right padding this
 * totals the `lg` the row carried before the actions button existed, so a
 * row without an actions button renders unchanged.
 */
import { StyleSheet } from 'react-native';

import { radii, spacing } from '../theme';

export const listRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingRight: spacing.sm,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.md,
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
});

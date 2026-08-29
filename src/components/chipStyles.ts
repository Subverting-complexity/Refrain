import { StyleSheet } from 'react-native';

import { spacing, Theme } from '../theme';

// Slim pills read as ~30pt tall; pad the touch area back out to the 44pt
// minimum vertically (and a little horizontally) without inflating the visual.
export const CHIP_HIT_SLOP = { top: 8, bottom: 8, left: 2, right: 2 } as const;

// The shared pill recipe — compact rounded outline with small bold label —
// used by the single-select ChipGroup. Kept as its own module so any future
// pill-style control shares one visual base instead of re-deriving the
// dimensions, rounded shape, and label type.
export const chipStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

// Selected/unselected pill colours, resolved from the active theme. Both
// chip variants share the same rule: selected fills with the accent, an
// unselected chip is a transparent outline.
//
// Selected text must read on the accent fill in BOTH themes. The accent is a
// light mint in dark mode and a mid green in light mode, so the legible
// foreground is the *dark* colour of each palette: `accentText` (dark) in dark
// mode, `textPrimary` (dark) in light mode. Using light-mode `accentText`
// (white) here is what produced the low-contrast white-on-green chips.
export function pillColors(theme: Theme, selected: boolean) {
  const selectedText = theme.dark
    ? theme.colors.accentText
    : theme.colors.textPrimary;
  return {
    backgroundColor: selected ? theme.colors.accent : 'transparent',
    // `outline` in both states. A selected pill is an `accent` fill, which in
    // light mode is 2.30 against the page, so the fill cannot carry the
    // control's own boundary; the ring does, exactly as it does on the toggle
    // and on the selected option in `FolderPickerDialog`.
    borderColor: theme.colors.outline,
    textColor: selected ? selectedText : theme.colors.textPrimary,
  };
}

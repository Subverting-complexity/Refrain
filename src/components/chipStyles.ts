import { StyleSheet } from 'react-native';

import { spacing, Theme } from '../theme';

// Slim pills read as ~30pt tall; pad the touch area back out to the 44pt
// minimum vertically (and a little horizontally) without inflating the visual.
// Shared by ChipGroup and ControlsDrawer so the two stay in lockstep.
export const CHIP_HIT_SLOP = { top: 8, bottom: 8, left: 2, right: 2 } as const;

// The shared pill recipe — compact rounded outline with small bold label —
// used by both the single-select ChipGroup and the panel-toggle chips in
// ControlsDrawer. They are different controls and keep their own layout
// (min size, row vs centred), but this visual base lives in one place so the
// dimensions, rounded shape, and label type can't drift apart.
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
export function pillColors(theme: Theme, selected: boolean) {
  return {
    backgroundColor: selected ? theme.colors.accent : 'transparent',
    borderColor: selected ? theme.colors.accent : theme.colors.border,
    textColor: selected ? theme.colors.accentText : theme.colors.textPrimary,
  };
}

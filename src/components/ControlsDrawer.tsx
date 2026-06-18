import React, { useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { CountdownConfig } from '../types';
import { AccessiblePressable } from './AccessiblePressable';
import { CHIP_HIT_SLOP, chipStyles, pillColors } from './chipStyles';
import { CountdownSettings } from './CountdownSettings';
import { SkipControls } from './SkipControls';
import { VolumeControl } from './VolumeControl';

// The three chips that expand an inline panel. Segments is handled separately
// because it opens a bottom sheet instead of an accordion panel.
type PanelKey = 'countIn' | 'volume' | 'skip';

interface ControlsDrawerProps {
  countdownConfig: CountdownConfig;
  onCountdownConfigChange: (config: CountdownConfig) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  skipSeconds: number;
  onSkipSecondsChange: (seconds: number) => void;
  /**
   * Opens the segment-profile sheet. When omitted (no track loaded) the
   * Segments chip is hidden, since there is nothing to manage.
   */
  onOpenSegments?: () => void;
  style?: ViewStyle;
}

const PANEL_CHIPS: {
  key: PanelKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'countIn', label: 'Count-in', icon: 'timer-outline' },
  { key: 'volume', label: 'Volume', icon: 'volume-medium-outline' },
  { key: 'skip', label: 'Skip', icon: 'play-skip-forward-outline' },
];

/**
 * Consolidates the count-in, volume, skip, and segment controls into a single
 * drawer. A chip row triggers the controls: tapping Count-in / Volume / Skip
 * expands an inline panel below the row (accordion — only one open at a time),
 * while Segments opens the existing bottom sheet without expanding inline.
 */
export function ControlsDrawer({
  countdownConfig,
  onCountdownConfigChange,
  volume,
  onVolumeChange,
  skipSeconds,
  onSkipSecondsChange,
  onOpenSegments,
  style,
}: ControlsDrawerProps) {
  const { theme } = useTheme();
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  const togglePanel = (key: PanelKey) => {
    setOpenPanel((prev) => (prev === key ? null : key));
  };

  const renderChip = (
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    active: boolean,
    accessibilityLabel: string,
    onPress: () => void,
    accessibilityState?: { expanded?: boolean },
  ) => {
    const colors = pillColors(theme, active);
    return (
      <AccessiblePressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        onPress={onPress}
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
        <Ionicons
          name={icon}
          size={16}
          color={active ? theme.colors.accentText : theme.colors.textSecondary}
        />
        <Text style={[chipStyles.pillText, { color: colors.textColor }]}>
          {label}
        </Text>
      </AccessiblePressable>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      <View style={styles.chipRow}>
        {PANEL_CHIPS.map((chip) =>
          renderChip(
            chip.label,
            chip.icon,
            openPanel === chip.key,
            `${chip.label} settings`,
            () => togglePanel(chip.key),
            { expanded: openPanel === chip.key },
          ),
        )}
        {onOpenSegments
          ? renderChip(
              'Segments',
              'bookmarks-outline',
              false,
              'Open segment profiles',
              onOpenSegments,
            )
          : null}
      </View>

      {openPanel !== null ? (
        <View style={[styles.panel, { borderTopColor: theme.colors.border }]}>
          {openPanel === 'countIn' ? (
            <CountdownSettings
              config={countdownConfig}
              onConfigChange={onCountdownConfigChange}
            />
          ) : null}
          {openPanel === 'volume' ? (
            <VolumeControl volume={volume} onVolumeChange={onVolumeChange} />
          ) : null}
          {openPanel === 'skip' ? (
            <SkipControls
              skipSeconds={skipSeconds}
              onSkipSecondsChange={onSkipSecondsChange}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
  },
  panel: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});

import React, { useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { CountdownConfig } from '../types';
import { AccessiblePressable } from './AccessiblePressable';
import { BottomSheet } from './BottomSheet';
import { CountdownSettings } from './CountdownSettings';
import { SkipControls } from './SkipControls';
import { VolumeControl } from './VolumeControl';

// The three launchers that open a settings sheet. Segments is handled
// separately because it opens the segment-profile sheet owned by the player.
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
   * Segments launcher is hidden, since there is nothing to manage.
   */
  onOpenSegments?: () => void;
  style?: ViewStyle;
}

const PANEL_LAUNCHERS: {
  key: PanelKey;
  label: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'countIn',
    label: 'Count-in settings',
    title: 'Count-in',
    icon: 'timer-outline',
  },
  {
    key: 'volume',
    label: 'Volume settings',
    title: 'Volume',
    icon: 'volume-medium-outline',
  },
  {
    key: 'skip',
    label: 'Skip settings',
    title: 'Skip',
    icon: 'play-skip-forward-outline',
  },
];

/**
 * The player's secondary-control launcher row: four icon-only squares for
 * count-in, volume, skip, and segments. Count-in / Volume / Skip each open a
 * bottom sheet carrying their settings body; Segments defers to the player's
 * segment-profile sheet. Keeping every launcher a pure sheet trigger lets the
 * row stay compact and sit in the footer above the transport.
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

  const renderSquare = (
    icon: keyof typeof Ionicons.glyphMap,
    accessibilityLabel: string,
    active: boolean,
    onPress: () => void,
    accessibilityState?: { expanded?: boolean },
  ) => (
    <AccessiblePressable
      key={accessibilityLabel}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={(pressState) => [
        styles.square,
        {
          backgroundColor: active ? theme.colors.accent : theme.colors.surface,
          borderColor: active ? theme.colors.accent : theme.colors.border,
          opacity: pressState.pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={active ? theme.colors.accentText : theme.colors.textSecondary}
      />
    </AccessiblePressable>
  );

  const openTitle = PANEL_LAUNCHERS.find((p) => p.key === openPanel)?.title;

  return (
    <View style={[styles.row, style]}>
      {PANEL_LAUNCHERS.map((launcher) =>
        renderSquare(
          launcher.icon,
          launcher.label,
          openPanel === launcher.key,
          () => setOpenPanel(launcher.key),
          { expanded: openPanel === launcher.key },
        ),
      )}
      {onOpenSegments
        ? renderSquare(
            'bookmarks-outline',
            'Open segment profiles',
            false,
            onOpenSegments,
          )
        : null}

      {openPanel !== null && openTitle ? (
        <BottomSheet title={openTitle} onClose={() => setOpenPanel(null)}>
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
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  square: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

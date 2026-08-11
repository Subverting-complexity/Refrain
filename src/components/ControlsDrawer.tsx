import { useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { spacing } from '../theme';
import { CountdownConfig } from '../types';
import { BottomSheet } from './BottomSheet';
import { CountdownSettings } from './CountdownSettings';
import { IconSquareButton } from './IconSquareButton';
import { SkipControls } from './SkipControls';
import { VolumeControl } from './VolumeControl';

// The three launchers that open a settings sheet. Segments is handled
// separately because it opens the segment-profile sheet owned by the player.
const DRAWER_BUTTON_SIZE = 48;

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
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  const openTitle = PANEL_LAUNCHERS.find((p) => p.key === openPanel)?.title;

  return (
    <View style={[styles.row, style]}>
      {PANEL_LAUNCHERS.map((launcher) => (
        <IconSquareButton
          key={launcher.label}
          icon={launcher.icon}
          accessibilityLabel={launcher.label}
          active={openPanel === launcher.key}
          onPress={() => setOpenPanel(launcher.key)}
          accessibilityState={{ expanded: openPanel === launcher.key }}
          size={DRAWER_BUTTON_SIZE}
        />
      ))}
      {onOpenSegments ? (
        <IconSquareButton
          icon="bookmarks-outline"
          accessibilityLabel="Open segment profiles"
          onPress={onOpenSegments}
          size={DRAWER_BUTTON_SIZE}
        />
      ) : null}

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
});

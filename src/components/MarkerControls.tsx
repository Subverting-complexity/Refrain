import React, { useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { radii, spacing } from '../theme';
import { PlaybackStatus } from '../types';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';
import { IconSquareButton } from './IconSquareButton';
import { MarkerTimeSheet } from './MarkerTimeSheet';

const MARKER_TILE_MIN_WIDTH = 50;
const MARKER_TILE_HEIGHT = 52;

export type PlaceMode = 'none' | 'A' | 'B';

interface MarkerControlsProps {
  status: PlaybackStatus;
  markerA: number | null;
  markerB: number | null;
  durationMs: number;
  loopEnabled: boolean;
  placeMode: PlaceMode;
  /** Press the A button when A is not set: arm placing A. */
  onPressA: () => void;
  /** Press the B button when B is not set: arm placing B. */
  onPressB: () => void;
  /** Commit an edited A position from the time sheet. */
  onEditA?: (ms: number) => void;
  /** Commit an edited B position from the time sheet. */
  onEditB?: (ms: number) => void;
  /** Remove A (and B) from the time sheet. */
  onRemoveA?: () => void;
  /** Remove B only from the time sheet. */
  onRemoveB?: () => void;
  onToggleLoop: (enabled: boolean) => void;
  /**
   * Save the current A/B region. Omitted when there is no track to save to —
   * the Save square is then shown disabled.
   */
  onSave?: () => void;
  /** Clear both markers and drop the loaded-segment identity. */
  onClear?: () => void;
  style?: ViewStyle;
}

export function MarkerControls({
  status,
  markerA,
  markerB,
  durationMs,
  loopEnabled,
  placeMode,
  onPressA,
  onPressB,
  onEditA,
  onEditB,
  onRemoveA,
  onRemoveB,
  onToggleLoop,
  onSave,
  onClear,
  style,
}: MarkerControlsProps) {
  const { theme } = useTheme();
  // null = closed; 'A' or 'B' = sheet open for that marker
  const [sheetTarget, setSheetTarget] = useState<'A' | 'B' | null>(null);
  const isDisabled = status === 'idle' || status === 'error';
  const hasRegion = markerA != null && markerB != null;
  // The loop is armable with or without markers: a full A/B region loops
  // between the markers, A alone loops from A to the end, and no markers
  // loops the whole track. So the toggle only needs a loaded track.
  const loopActive = !isDisabled && loopEnabled;
  const loopDisabled = isDisabled;
  // Save needs a complete region and somewhere to save it; Clear needs at
  // least a start marker to wipe.
  const saveDisabled = isDisabled || !hasRegion || !onSave;
  const clearDisabled = isDisabled || markerA == null || !onClear;

  const renderButton = (
    label: 'A' | 'B',
    value: number | null,
    color: string,
    arming: boolean,
    disabled: boolean,
    onPress: () => void,
  ) => {
    // The sub-line communicates the button's current action: where to tap
    // while arming, the marker time once placed, or a prompt to set it.
    const sub = arming
      ? 'Tap wave'
      : value != null
        ? formatDuration(value)
        : 'Set';
    const accessibilityLabel =
      value != null
        ? `${label === 'A' ? 'Loop start' : 'Loop end'} ${formatDuration(value)}. Edit or remove`
        : arming
          ? `Cancel placing loop ${label === 'A' ? 'start' : 'end'}`
          : `Place loop ${label === 'A' ? 'start' : 'end'}`;
    // When a marker is set, the tile press opens the time editor instead of
    // clearing. Clearing now lives in the sheet's Remove button.
    const handlePress = value != null ? () => setSheetTarget(label) : onPress;
    return (
      <AccessiblePressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, selected: arming || value != null }}
        onPress={handlePress}
        disabled={disabled}
        style={(pressState) => [
          styles.tile,
          {
            borderColor: arming || value != null ? color : theme.colors.border,
            borderWidth: arming ? 2 : 1,
            backgroundColor: theme.colors.surface,
            opacity: disabled ? 0.4 : pressState.pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text style={[styles.tileLabel, { color }]}>{label}</Text>
        <Text
          style={[styles.tileValue, { color: theme.colors.textPrimary }]}
          numberOfLines={1}
        >
          {sub}
        </Text>
      </AccessiblePressable>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        {renderButton(
          'A',
          markerA,
          theme.colors.markerA,
          placeMode === 'A',
          isDisabled,
          onPressA,
        )}
        {renderButton(
          'B',
          markerB,
          theme.colors.markerB,
          placeMode === 'B',
          isDisabled || (markerA == null && markerB == null),
          onPressB,
        )}

        <IconSquareButton
          icon="repeat"
          accessibilityLabel={loopActive ? 'Turn loop off' : 'Turn loop on'}
          active={loopActive}
          disabled={loopDisabled}
          onPress={() => onToggleLoop(!loopEnabled)}
          accessibilityRole="switch"
          accessibilityState={{ checked: loopActive }}
          accessibilityHint={
            hasRegion
              ? 'Repeats playback between the A and B points'
              : 'Repeats the whole track, or from A when only A is set'
          }
        />
        <IconSquareButton
          icon="save-outline"
          accessibilityLabel="Save segment"
          disabled={saveDisabled}
          onPress={() => onSave?.()}
          accessibilityHint={
            saveDisabled ? 'Set both loop markers first' : undefined
          }
        />
        <IconSquareButton
          icon="close"
          accessibilityLabel="Clear loop markers"
          disabled={clearDisabled}
          onPress={() => onClear?.()}
        />
      </View>

      {!isDisabled && (placeMode === 'A' || placeMode === 'B') && (
        <Text
          style={[styles.caption, { color: theme.colors.textSecondary }]}
          accessibilityLiveRegion="polite"
        >
          {placeMode === 'A'
            ? 'Tap the wave to drop A'
            : 'Tap the wave to drop B after A'}
        </Text>
      )}

      {sheetTarget === 'A' && markerA != null && onEditA && (
        <MarkerTimeSheet
          marker="A"
          initialMs={markerA}
          durationMs={durationMs}
          onCommit={onEditA}
          onRemove={() => {
            setSheetTarget(null);
            onRemoveA?.();
          }}
          onDismiss={() => setSheetTarget(null)}
        />
      )}
      {sheetTarget === 'B' && markerB != null && onEditB && (
        <MarkerTimeSheet
          marker="B"
          initialMs={markerB}
          durationMs={durationMs}
          onCommit={onEditB}
          onRemove={() => {
            setSheetTarget(null);
            onRemoveB?.();
          }}
          onDismiss={() => setSheetTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  tile: {
    minWidth: MARKER_TILE_MIN_WIDTH,
    height: MARKER_TILE_HEIGHT,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  tileValue: {
    fontSize: 12,
    marginTop: 2,
  },
  caption: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

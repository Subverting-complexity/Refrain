import React, { useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { PlaybackStatus } from '../types';
import { formatDuration } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';
import { MarkerTimeSheet } from './MarkerTimeSheet';

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
  const canLoop = markerA != null && markerB != null;
  const loopActive = canLoop && loopEnabled;
  const loopDisabled = isDisabled || !canLoop;
  // Save needs a complete region and somewhere to save it; Clear needs at
  // least a start marker to wipe.
  const saveDisabled = isDisabled || !canLoop || !onSave;
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

  const renderSquare = (
    icon: keyof typeof Ionicons.glyphMap,
    accessibilityLabel: string,
    active: boolean,
    disabled: boolean,
    onPress: () => void,
    extraAccessibility?: {
      role?: 'button' | 'switch';
      state?: Record<string, boolean>;
      hint?: string;
    },
  ) => (
    <AccessiblePressable
      accessibilityRole={extraAccessibility?.role ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, ...extraAccessibility?.state }}
      accessibilityHint={extraAccessibility?.hint}
      onPress={onPress}
      disabled={disabled}
      style={(pressState) => [
        styles.square,
        {
          backgroundColor: active ? theme.colors.accent : theme.colors.surface,
          borderColor: active ? theme.colors.accent : theme.colors.border,
          opacity: disabled ? 0.4 : pressState.pressed ? 0.7 : 1,
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
          // B can't be placed before A exists; once A is set it's available.
          isDisabled || (markerA == null && markerB == null),
          onPressB,
        )}

        {renderSquare(
          'repeat',
          loopActive ? 'Turn loop off' : 'Turn loop on',
          loopActive,
          loopDisabled,
          () => onToggleLoop(!loopEnabled),
          {
            role: 'switch',
            state: { checked: loopActive },
            hint: 'Repeats playback between the A and B points',
          },
        )}
        {renderSquare(
          'save-outline',
          'Save segment',
          false,
          saveDisabled,
          () => onSave?.(),
          {
            hint: saveDisabled ? 'Set both loop markers first' : undefined,
          },
        )}
        {renderSquare('close', 'Clear loop markers', false, clearDisabled, () =>
          onClear?.(),
        )}
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
    minWidth: 50,
    height: 52,
    borderRadius: 12,
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
  // Loop / Save / Clear share one square recipe. 44pt keeps five controls on a
  // single row down to a ~272pt content width (iPhone SE) without wrapping.
  square: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  caption: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

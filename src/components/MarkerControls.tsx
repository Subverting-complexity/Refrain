import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import {
  MarkerDrag,
  TARGET_MARKER_A,
  TARGET_MARKER_B,
  useMarkerDrag,
} from '../hooks/useMarkerDrag';
import { useTheme } from '../hooks/useTheme';
import { useUiDerivedNumber } from '../hooks/useUiDerivedNumber';
import { radii, spacing } from '../theme';
import { PlaybackStatus } from '../types';
import { formatDuration } from '../utils/formatTime';
import { markerBounds } from '../utils/markerBounds';
import { AccessiblePressable } from './AccessiblePressable';
import { IconSquareButton } from './IconSquareButton';
import { MarkerTimeSheet } from './MarkerTimeSheet';

const MARKER_TILE_MIN_WIDTH = 50;
const MARKER_TILE_HEIGHT = 52;

/** No marker is being dragged, so the tile shows the committed position. */
const NOT_DRAGGING = -1;

export type PlaceMode = 'none' | 'A' | 'B';

interface MarkerControlsProps {
  status: PlaybackStatus;
  markerA: number | null;
  markerB: number | null;
  /**
   * The waveform's in-flight drag, so a tile shows where its marker is being
   * dragged *to* rather than where it was last committed. The engine is only
   * written twice per gesture now (see {@link MarkerDrag}), so without this the
   * tile's time would sit still for the length of a drag and then jump.
   *
   * Optional: with no drag supplied the tiles simply follow the committed
   * positions, which is what they do outside the player.
   */
  markerDrag?: MarkerDrag;
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

/**
 * Memoised, and given only values that move at human speed. The row used to
 * re-render ten times a second because the player subscribed to the playhead,
 * and twenty times a second during a marker drag because the engine echoed
 * every throttled position back through the screen. Neither reaches it now:
 * the playhead does not come here at all, and a drag arrives as a shared value
 * that only crosses the thread boundary when the second on the tile changes.
 */
export const MarkerControls = React.memo(function MarkerControls({
  status,
  markerA,
  markerB,
  markerDrag,
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

  // A tile shows a time in whole seconds, so that is what it subscribes to.
  // Both are projected on the UI thread and cross back only when the second
  // they display changes — not on every pointer event of the drag, and not
  // through the screen. The idle value is NOT_DRAGGING rather than the position
  // itself, so a released marker falls back to the committed prop instead of
  // holding the last place a finger left it.
  const ownDrag = useMarkerDrag();
  const drag = markerDrag ?? ownDrag;
  const deriveDragA = useCallback(() => {
    'worklet';
    if (drag.target.value !== TARGET_MARKER_A) return NOT_DRAGGING;
    return Math.floor(Math.max(0, drag.ms.value) / 1000);
  }, [drag]);
  const deriveDragB = useCallback(() => {
    'worklet';
    if (drag.target.value !== TARGET_MARKER_B) return NOT_DRAGGING;
    return Math.floor(Math.max(0, drag.ms.value) / 1000);
  }, [drag]);
  const dragASecond = useUiDerivedNumber(deriveDragA, NOT_DRAGGING);
  const dragBSecond = useUiDerivedNumber(deriveDragB, NOT_DRAGGING);
  // Only ever a substitute for a marker that already exists: a tap-to-place
  // writes the new marker on the first pointer event, so `markerA` is set
  // before any drag of A can be in flight.
  const shownA = dragASecond === NOT_DRAGGING ? markerA : dragASecond * 1000;
  const shownB = dragBSecond === NOT_DRAGGING ? markerB : dragBSecond * 1000;

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
            borderColor: arming || value != null ? color : theme.colors.outline,
            borderWidth: arming ? 2 : 1,
            backgroundColor: theme.colors.surface,
            opacity: disabled ? 0.4 : pressState.pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text style={[styles.tileLabel, { color }]}>{label}</Text>
        <Text
          style={[
            theme.typography.caption,
            styles.tileValue,
            { color: theme.colors.textPrimary },
          ]}
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
          shownA,
          theme.colors.markerA,
          placeMode === 'A',
          isDisabled,
          onPressA,
        )}
        {renderButton(
          'B',
          shownB,
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
          style={[
            theme.typography.caption,
            styles.caption,
            { color: theme.colors.textSecondary },
          ]}
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
          {...markerBounds('A', markerA, markerB, durationMs)}
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
          {...markerBounds('B', markerA, markerB, durationMs)}
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
});

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
  // The tile letter is intentionally bespoke (13/700): it is a badge, not
  // body copy, sized between caption and bodySmall so the tile stays compact.
  tileLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Type comes from theme.typography.caption at the usage site; these hold
  // only the layout deltas.
  tileValue: {
    marginTop: spacing.xs / 2,
  },
  caption: {
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

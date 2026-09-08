import { useCallback, useMemo } from 'react';
import { AccessibilityActionEvent, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSharedNumber } from '../hooks/useSharedNumber';
import { useDisplayRatio, useSliderGesture } from '../hooks/useSliderGesture';
import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { isWebAudioGainSupported } from '../services/webAudioGain';
import { isIOSWeb } from '../utils/platform';
import { SliderBar } from './SliderBar';

const VOLUME_STEP = 0.05;

// Module-level so the array identity never changes: built inline it was a new
// object on every drag frame, and so a changed prop on the host view.
const STEP_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function iconForVolume(volume: number): keyof typeof Ionicons.glyphMap {
  if (volume <= 0) return 'volume-mute';
  if (volume < 0.34) return 'volume-low';
  if (volume < 0.67) return 'volume-medium';
  return 'volume-high';
}

interface VolumeControlProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
}

export function VolumeControl({ volume, onVolumeChange }: VolumeControlProps) {
  const { theme } = useTheme();

  const { pan, handleLayout, trackWidth, dragRatio } = useSliderGesture({
    onValueChange: onVolumeChange,
  });

  // The bar follows the finger on the UI thread; the icon and the percentage
  // follow the engine's echo of the value, which arrives at the drag's
  // throttled cadence. Fifty milliseconds behind a moving finger is not
  // something a reader can see on a number, and it keeps a dragging thumb from
  // re-rendering the row it sits in.
  const displayVolume = clamp01(volume);
  const percent = Math.round(displayVolume * 100);
  const settledRatio = useSharedNumber(displayVolume);
  const progress = useDisplayRatio(settledRatio, dragRatio);

  const showIOSHint = isIOSWeb() && !isWebAudioGainSupported();

  // Rebuilt only when the announced percentage changes, rather than on every
  // frame of a volume drag.
  const a11yValue = useMemo(
    () => ({ min: 0, max: 100, now: percent }),
    [percent],
  );

  const handleAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      const { actionName } = e.nativeEvent;
      if (actionName === 'increment') {
        onVolumeChange(clamp01(volume + VOLUME_STEP));
      } else if (actionName === 'decrement') {
        onVolumeChange(clamp01(volume - VOLUME_STEP));
      }
    },
    [volume, onVolumeChange],
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons
            name={iconForVolume(displayVolume)}
            size={20}
            color={theme.colors.textSecondary}
          />
        </View>

        <View
          style={styles.slider}
          accessibilityRole="adjustable"
          accessibilityLabel={`Volume: ${percent}%`}
          accessibilityActions={STEP_ACTIONS}
          onAccessibilityAction={handleAccessibilityAction}
          accessibilityValue={a11yValue}
        >
          <SliderBar
            progress={progress}
            trackWidth={trackWidth}
            trackColor={theme.colors.track}
            fillColor={theme.colors.accentForeground}
            pan={pan}
            onLayout={handleLayout}
            style={styles.sliderBarFlex}
          />
          <Text
            style={[
              theme.typography.caption,
              styles.percent,
              { color: theme.colors.textSecondary },
            ]}
          >
            {percent}%
          </Text>
        </View>
      </View>
      {showIOSHint ? (
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textSecondary },
          ]}
        >
          On iOS, use your device buttons to adjust volume.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 28,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  slider: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sliderBarFlex: {
    flex: 1,
  },
  percent: {
    marginLeft: spacing.md,
    minWidth: 40,
    textAlign: 'right',
  },
});

import React, { useCallback, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useDragThrottle } from '../hooks/useDragThrottle';
import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { isWebAudioGainSupported } from '../services/webAudioGain';
import { isIOSWeb } from '../utils/platform';

// Keyboard / screen-reader nudge: 5% of the full range per step.
const VOLUME_STEP = 0.05;

interface VolumeControlProps {
  /** Current volume in the range 0..1. */
  volume: number;
  /** Called with the new volume (0..1) as the user drags or steps. */
  onVolumeChange: (volume: number) => void;
  style?: ViewStyle;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function iconForVolume(volume: number): keyof typeof Ionicons.glyphMap {
  if (volume <= 0) return 'volume-mute';
  if (volume < 0.34) return 'volume-low';
  if (volume < 0.67) return 'volume-medium';
  return 'volume-high';
}

export function VolumeControl({
  volume,
  onVolumeChange,
  style,
}: VolumeControlProps) {
  const { theme } = useTheme();
  const trackWidth = useRef(0);

  // While dragging, this local ratio drives the visual so the bar stays
  // smooth even though native volume calls are throttled. null = not dragging.
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const volumeThrottle = useDragThrottle();
  const displayVolume = clamp01(dragRatio ?? volume);
  const percent = Math.round(displayVolume * 100);

  // The slider truly attenuates everywhere the Web Audio gain graph is
  // available (including iOS Safari). Only surface the "use device buttons"
  // hint on iOS web when that graph is unavailable and volume genuinely
  // can't be controlled programmatically.
  const showIOSHint = isIOSWeb() && !isWebAudioGainSupported();

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  }, []);

  const ratioFromEvent = useCallback(
    (e: GestureResponderEvent): number | null => {
      if (trackWidth.current <= 0) return null;
      return clamp01(e.nativeEvent.locationX / trackWidth.current);
    },
    [],
  );

  const handleGrant = useCallback(
    (e: GestureResponderEvent) => {
      const ratio = ratioFromEvent(e);
      if (ratio === null) return;
      setDragRatio(ratio);
      volumeThrottle.begin(ratio, onVolumeChange);
    },
    [ratioFromEvent, onVolumeChange, volumeThrottle],
  );

  const handleMove = useCallback(
    (e: GestureResponderEvent) => {
      const ratio = ratioFromEvent(e);
      if (ratio === null) return;
      setDragRatio(ratio);
      volumeThrottle.move(ratio);
    },
    [ratioFromEvent, volumeThrottle],
  );

  const handleRelease = useCallback(() => {
    volumeThrottle.end();
    setDragRatio(null);
  }, [volumeThrottle]);

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
    <View style={[styles.container, style]}>
      <View
        style={styles.row}
        accessibilityRole="adjustable"
        accessibilityLabel={`Volume: ${percent}%`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <Ionicons
          name={iconForVolume(displayVolume)}
          size={20}
          color={theme.colors.textSecondary}
          style={styles.icon}
        />
        <View
          style={styles.barTouchArea}
          onLayout={handleLayout}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleGrant}
          onResponderMove={handleMove}
          onResponderRelease={handleRelease}
          onResponderTerminate={handleRelease}
        >
          <View
            style={[styles.barTrack, { backgroundColor: theme.colors.border }]}
          >
            <View
              style={[
                styles.barFill,
                {
                  backgroundColor: theme.colors.accent,
                  width: `${displayVolume * 100}%`,
                },
              ]}
            />
          </View>
          <View
            style={[
              styles.thumb,
              {
                backgroundColor: theme.colors.accent,
                left: `${displayVolume * 100}%`,
              },
            ]}
          />
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
    marginRight: spacing.md,
  },
  barTouchArea: {
    flex: 1,
    paddingVertical: spacing.lg,
    position: 'relative',
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: 10,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
});

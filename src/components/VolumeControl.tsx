import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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

export function VolumeControl({ volume, onVolumeChange }: VolumeControlProps) {
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

  const ratioFromX = useCallback((x: number): number | null => {
    if (trackWidth.current <= 0) return null;
    return clamp01(x / trackWidth.current);
  }, []);

  const beginDrag = useCallback(
    (x: number) => {
      const ratio = ratioFromX(x);
      if (ratio === null) return;
      setDragRatio(ratio);
      volumeThrottle.begin(ratio, onVolumeChange);
    },
    [ratioFromX, onVolumeChange, volumeThrottle],
  );

  const moveDrag = useCallback(
    (x: number) => {
      const ratio = ratioFromX(x);
      if (ratio === null) return;
      setDragRatio(ratio);
      volumeThrottle.move(ratio);
    },
    [ratioFromX, volumeThrottle],
  );

  const endDrag = useCallback(() => {
    volumeThrottle.end();
    setDragRatio(null);
  }, [volumeThrottle]);

  // Route through refs so the Pan is created once (see WaveformView).
  const beginRef = useRef(beginDrag);
  const moveRef = useRef(moveDrag);
  const endRef = useRef(endDrag);
  beginRef.current = beginDrag;
  moveRef.current = moveDrag;
  endRef.current = endDrag;

  // Same Pan setup as the other sliders: `minDistance(0)` claims the touch so
  // the surrounding ScrollView can't steal the drag, `runOnJS` keeps callbacks
  // on the JS thread.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => beginRef.current(e.x))
        .onUpdate((e) => moveRef.current(e.x))
        .onFinalize(() => endRef.current()),
    [],
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
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={handleAccessibilityAction}
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.barTouchArea} onLayout={handleLayout}>
              <View
                style={[
                  styles.barTrack,
                  { backgroundColor: theme.colors.border },
                ]}
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
          </GestureDetector>
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
  barTouchArea: {
    flex: 1,
    paddingVertical: spacing.lg,
    position: 'relative',
  },
  percent: {
    marginLeft: spacing.md,
    minWidth: 40,
    textAlign: 'right',
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

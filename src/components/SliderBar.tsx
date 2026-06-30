import React from 'react';
import { DimensionValue, StyleSheet, View, ViewStyle } from 'react-native';
import { GestureDetector, PanGesture } from 'react-native-gesture-handler';

import { spacing } from '../theme';

interface SliderBarProps {
  progress: number;
  trackColor: string;
  fillColor: string;
  pan: PanGesture;
  onLayout: (e: import('react-native').LayoutChangeEvent) => void;
  paddingVertical?: number;
  style?: ViewStyle;
}

export function SliderBar({
  progress,
  trackColor,
  fillColor,
  pan,
  onLayout,
  paddingVertical = spacing.lg,
  style,
}: SliderBarProps) {
  const pct = `${progress * 100}%` as DimensionValue;
  const thumbTop = paddingVertical - 6;

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.barTouchArea, { paddingVertical }, style]}
        onLayout={onLayout}
      >
        <View style={[styles.barTrack, { backgroundColor: trackColor }]}>
          <View
            style={[styles.barFill, { backgroundColor: fillColor, width: pct }]}
          />
        </View>
        <View
          style={[
            styles.thumb,
            { backgroundColor: fillColor, left: pct, top: thumbTop },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  barTouchArea: {
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
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
});

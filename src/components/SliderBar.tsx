import { LayoutChangeEvent, StyleSheet, ViewStyle } from 'react-native';
import { GestureDetector, PanGesture } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { spacing } from '../theme';
import { clampRatio, thumbOffsetPx } from './sliderGeometry';

interface SliderBarProps {
  /** The 0..1 position to draw, as a shared value. */
  progress: SharedValue<number>;
  /** Measured track width in pixels, for placing the thumb. */
  trackWidth: SharedValue<number>;
  trackColor: string;
  fillColor: string;
  pan: PanGesture;
  onLayout: (e: LayoutChangeEvent) => void;
  paddingVertical?: number;
  style?: ViewStyle;
}

const THUMB_SIZE = 16;

/**
 * The bar behind the seek and volume sliders: a track, a fill, and a thumb.
 *
 * The fill and the thumb are driven by a shared value through animated styles,
 * so they move on the UI thread. They used to be positioned with percentage
 * `width` and `left`, which are layout values: every frame of a drag, and every
 * playback tick, re-ran Yoga over the bar and waited for a React commit before
 * anything moved. A scale and a translation are resolved where the frame is
 * drawn, so the same movement costs no layout and no render.
 *
 * The fill is scaled rather than resized for the same reason. Its 2px corner
 * radius scales with it, which at that size is not a difference anyone can see,
 * and it is what lets the bar follow a finger without a layout pass.
 */
export function SliderBar({
  progress,
  trackWidth,
  trackColor,
  fillColor,
  pan,
  onLayout,
  paddingVertical = spacing.lg,
  style,
}: SliderBarProps) {
  const thumbTop = paddingVertical - THUMB_SIZE / 2 + 2;

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: clampRatio(progress.value) }],
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbOffsetPx(progress.value, trackWidth.value) }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.barTouchArea, { paddingVertical }, style]}
        onLayout={onLayout}
      >
        <Animated.View
          style={[styles.barTrack, { backgroundColor: trackColor }]}
        >
          <Animated.View
            style={[styles.barFill, { backgroundColor: fillColor }, fillStyle]}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.thumb,
            { backgroundColor: fillColor, top: thumbTop },
            thumbStyle,
          ]}
        />
      </Animated.View>
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
  // Full width and scaled down from the left edge, so `scaleX` reads as a
  // fill level. Without the origin the fill would grow from its centre.
  barFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    transformOrigin: 'left center',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    marginLeft: -THUMB_SIZE / 2,
  },
});

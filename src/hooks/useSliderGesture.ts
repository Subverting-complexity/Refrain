import { useCallback, useEffect } from 'react';
import { LayoutChangeEvent } from 'react-native';
import {
  SharedValue,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { useLatestRef } from './useLatestRef';
import { usePanGesture } from './usePanGesture';
import { useUiDragThrottle } from './useUiDragThrottle';

interface UseSliderGestureOptions {
  onValueChange: (ratio: number) => void;
  enabled?: boolean;
}

/** No drag in flight. Ratios are 0..1, so a negative value cannot collide. */
export const NO_DRAG = -1;

export interface UseSliderGesture {
  /** The Pan gesture to hand to a `GestureDetector`. Built once. */
  pan: ReturnType<typeof usePanGesture>;
  /** Layout handler for the track; measures its width. */
  handleLayout: (e: LayoutChangeEvent) => void;
  /** Track width in pixels, for placing the thumb. */
  trackWidth: SharedValue<number>;
  /** The live ratio under the finger, or {@link NO_DRAG} when idle. */
  dragRatio: SharedValue<number>;
}

/**
 * Touch behaviour for a horizontal slider: map x to a 0..1 ratio, follow the
 * finger, and call back at a throttled cadence.
 *
 * Everything the drag needs to draw itself lives in shared values, so the whole
 * gesture runs on the UI thread and re-renders nothing. `dragRatio` is what the
 * bar animates from; the caller's own value (volume, playback position) still
 * arrives as a prop and takes over the moment the drag ends.
 */
export function useSliderGesture({
  onValueChange,
  enabled = true,
}: UseSliderGestureOptions): UseSliderGesture {
  const trackWidth = useSharedValue(0);
  const dragRatio = useSharedValue(NO_DRAG);
  // Mirrored rather than captured: a worklet that closed over the prop would
  // change identity whenever it flipped, rebuilding the gesture mid-drag.
  const enabledValue = useSharedValue(enabled);
  useEffect(() => {
    enabledValue.value = enabled;
  }, [enabled, enabledValue]);

  const changeRef = useLatestRef(onValueChange);
  // Stable, so the throttle's worklets are stable and the Pan is built once.
  const fire = useCallback(
    (ratio: number) => {
      changeRef.current(ratio);
    },
    [changeRef],
  );
  const throttle = useUiDragThrottle(fire);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      trackWidth.value = e.nativeEvent.layout.width;
    },
    [trackWidth],
  );

  const ratioFromX = useCallback(
    (x: number): number => {
      'worklet';
      if (!enabledValue.value || trackWidth.value <= 0) return NO_DRAG;
      return Math.max(0, Math.min(1, x / trackWidth.value));
    },
    [enabledValue, trackWidth],
  );

  const onBegin = useCallback(
    (x: number) => {
      'worklet';
      const ratio = ratioFromX(x);
      if (ratio === NO_DRAG) return;
      dragRatio.value = ratio;
      throttle.begin(ratio);
    },
    [ratioFromX, dragRatio, throttle],
  );

  const onUpdate = useCallback(
    (x: number) => {
      'worklet';
      const ratio = ratioFromX(x);
      if (ratio === NO_DRAG) return;
      dragRatio.value = ratio;
      throttle.move(ratio);
    },
    [ratioFromX, dragRatio, throttle],
  );

  const onFinalize = useCallback(() => {
    'worklet';
    // Order matters: the throttle's final value is scheduled onto the JS
    // thread before the drag is released, so the caller's last callback
    // carries where the finger actually stopped.
    throttle.end();
    dragRatio.value = NO_DRAG;
  }, [throttle, dragRatio]);

  const pan = usePanGesture({ onBegin, onUpdate, onFinalize });

  return { pan, handleLayout, trackWidth, dragRatio };
}

/**
 * What a slider should draw: the finger while a drag is in flight, and the
 * settled value the rest of the time.
 *
 * Both are shared values, so the switch happens on the UI thread and the bar
 * neither re-renders when the finger moves nor lags a frame behind it when the
 * drag ends.
 */
export function useDisplayRatio(
  settled: SharedValue<number>,
  dragRatio: SharedValue<number>,
): SharedValue<number> {
  return useDerivedValue(() =>
    dragRatio.value === NO_DRAG ? settled.value : dragRatio.value,
  );
}

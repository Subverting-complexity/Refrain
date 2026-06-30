import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import { useDragThrottle } from './useDragThrottle';

interface UseSliderGestureOptions {
  onValueChange: (ratio: number) => void;
  enabled?: boolean;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function useSliderGesture({
  onValueChange,
  enabled = true,
}: UseSliderGestureOptions) {
  const trackWidth = useRef(0);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const throttle = useDragThrottle();

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  }, []);

  const ratioFromX = useCallback(
    (x: number): number | null => {
      if (!enabled || trackWidth.current <= 0) return null;
      return clamp01(x / trackWidth.current);
    },
    [enabled],
  );

  const beginDrag = useCallback(
    (x: number) => {
      const ratio = ratioFromX(x);
      if (ratio === null) return;
      setDragRatio(ratio);
      throttle.begin(ratio, onValueChange);
    },
    [ratioFromX, onValueChange, throttle],
  );

  const moveDrag = useCallback(
    (x: number) => {
      const ratio = ratioFromX(x);
      if (ratio === null) return;
      setDragRatio(ratio);
      throttle.move(ratio);
    },
    [ratioFromX, throttle],
  );

  const endDrag = useCallback(() => {
    throttle.end();
    setDragRatio(null);
  }, [throttle]);

  const beginRef = useRef(beginDrag);
  const moveRef = useRef(moveDrag);
  const endRef = useRef(endDrag);
  useEffect(() => {
    beginRef.current = beginDrag;
    moveRef.current = moveDrag;
    endRef.current = endDrag;
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onBegin((e) => beginRef.current(e.x))
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onUpdate((e) => moveRef.current(e.x))
        // eslint-disable-next-line react-hooks/refs -- deferred gesture callback, runs on touch not render
        .onFinalize(() => endRef.current()),
    [],
  );

  return { pan, handleLayout, dragRatio };
}

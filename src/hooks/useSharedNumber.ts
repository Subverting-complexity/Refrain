import { useEffect } from 'react';
import { SharedValue, useSharedValue } from 'react-native-reanimated';

/**
 * Mirror a plain prop into a shared value.
 *
 * The gesture and the overlays it moves run on the UI thread, where a React
 * prop is not visible. Anything they need from props — the track length, a
 * marker, whether a control is enabled — is copied across by one of these.
 *
 * The copy happens in an effect rather than during render because writing a
 * shared value is a side effect: React may render a component without
 * committing it, and a write from that render would be a change the UI thread
 * can never be told to undo.
 *
 * The shared value's identity never changes, so a worklet reading it stays
 * stable however often the prop moves. That is the property the whole design
 * rests on: it is what lets a gesture be built exactly once.
 */
export function useSharedNumber(value: number): SharedValue<number> {
  const shared = useSharedValue(value);
  useEffect(() => {
    shared.value = value;
  }, [value, shared]);
  return shared;
}

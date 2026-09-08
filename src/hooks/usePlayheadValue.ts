import { useEffect } from 'react';
import {
  Easing,
  SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PlaybackState } from '../types';

/**
 * How often the audio engine reports a position, in milliseconds. Mirrors the
 * `updateInterval` the player is created with; see `audioEngine.loadTrack`.
 */
export const PLAYHEAD_TICK_MS = 100;

/**
 * How far ahead of the last reported position a new one may be and still count
 * as ordinary playback. Three ticks of slack absorbs a late status update
 * without mistaking a seek for one.
 */
const MAX_GLIDE_MS = PLAYHEAD_TICK_MS * 3;

/**
 * Whether a newly reported position should be glided to rather than jumped to.
 *
 * Only forward movement during playback glides. A seek, a loop rewind, a pause
 * and a track change all jump, because gliding those would draw the playhead
 * somewhere the audio is not.
 */
export function shouldGlide(
  previousMs: number,
  nextMs: number,
  isPlaying: boolean,
): boolean {
  return (
    isPlaying && nextMs > previousMs && nextMs - previousMs <= MAX_GLIDE_MS
  );
}

/**
 * The playhead as a shared value, fed straight from the audio engine and
 * gliding between the positions it reports.
 *
 * ## Why it subscribes rather than taking a prop
 *
 * It used to take `positionMs` as a prop and copy it into a shared value in an
 * effect, which meant React had to render before the playhead could move — ten
 * times a second while playing, and at the drag's cadence while scrubbing. The
 * render was the expensive part: on the New Architecture every commit is
 * mounted on the Android UI thread inside the same Choreographer pass that has
 * to finish before the frame is drawn, so a screen re-rendering for a value
 * only the cursor used was stealing time from drawing the cursor.
 *
 * Subscribing here writes the shared value directly. Nothing renders, on any
 * thread, for the playhead to move — during playback or during a drag. The
 * screen owns the subscription and hands the shared value down, so the
 * components that draw the playhead stay presentational and the engine is
 * bound in one place.
 *
 * The engine's own reports are still only ten a second; the interpolation runs
 * in the UI runtime, so the frames between them are filled where the frames are
 * drawn and cost no JavaScript at all.
 */
export function usePlayheadValue(
  subscribe: (onChange: (state: PlaybackState) => void) => () => void,
  getState: () => PlaybackState,
): SharedValue<number> {
  const playhead = useSharedValue(0);

  useEffect(() => {
    playhead.value = getState().positionMs;
    return subscribe((state) => {
      const previous = playhead.value;
      playhead.value = shouldGlide(
        previous,
        state.positionMs,
        state.status === 'playing',
      )
        ? withTiming(state.positionMs, {
            duration: PLAYHEAD_TICK_MS,
            easing: Easing.linear,
          })
        : state.positionMs;
    });
  }, [subscribe, getState, playhead]);

  return playhead;
}

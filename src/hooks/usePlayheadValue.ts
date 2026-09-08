import { useEffect } from 'react';
import {
  Easing,
  SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
 * The playhead as a shared value, gliding between the positions the engine
 * reports.
 *
 * The engine reports ten times a second. Moving the cursor straight to each
 * report steps it ten times a second, which on a long track is a visible
 * stutter — the movement is small, but it arrives in lumps against a screen
 * refreshing six to twelve times as often. Interpolating between reports draws
 * it at the display's own rate.
 *
 * The interpolation runs on the UI thread, so the smoothing costs no JavaScript
 * at all: the same ten updates a second cross the boundary, and the frames
 * between them are filled where the frames are drawn.
 *
 * Only forward movement during playback is glided. A seek, a loop rewind, a
 * pause and a track change all jump, because gliding those would draw the
 * playhead somewhere the audio is not.
 */
export function usePlayheadValue(
  positionMs: number,
  isPlaying: boolean,
): SharedValue<number> {
  const playhead = useSharedValue(positionMs);

  useEffect(() => {
    const previous = playhead.value;
    const advancing =
      isPlaying &&
      positionMs > previous &&
      positionMs - previous <= MAX_GLIDE_MS;
    playhead.value = advancing
      ? withTiming(positionMs, {
          duration: PLAYHEAD_TICK_MS,
          easing: Easing.linear,
        })
      : positionMs;
  }, [positionMs, isPlaying, playhead]);

  return playhead;
}

import { useState } from 'react';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

/**
 * A number computed on the UI thread from shared values, mirrored into React
 * state **only when it actually changes**.
 *
 * This is the bridge back from the UI thread for the handful of things React
 * still has to draw: a clock that reads in whole seconds, an amplitude bar that
 * is one of three colours, a percentage announced to a screen reader. All of
 * them are coarse projections of something that moves every frame, and all of
 * them were previously fed the raw millisecond value — so the component
 * re-rendered at the engine's rate, or a finger's, to redraw a picture that had
 * not changed.
 *
 * `derive` runs in the UI runtime on the frames its inputs move, which is cheap
 * and costs no render. The thread boundary is crossed only when the projection
 * lands on a different number, so the render rate is the rate of the thing
 * being *shown*, not of the thing it was derived from.
 *
 * ## Choosing what to derive from
 *
 * Derive from a value that moves at the engine's pace, not at a finger's. A
 * projection of the drag position can change on every frame of a fast drag —
 * a whole second of a three-minute track is crossed in a few pixels — and that
 * would re-render harder than the raw value ever did. The playhead the engine
 * reports is bounded by its own update rate; a finger is bounded only by the
 * display.
 *
 * `derive` must be a worklet and must be stable — it is a dependency of the
 * reaction, and an inline arrow would tear the reaction down and rebuild it on
 * every render. Wrap it in `useCallback` with a `'worklet'` directive.
 */
export function useUiDerivedNumber(
  derive: () => number,
  initial: number,
): number {
  const [value, setValue] = useState(initial);

  useAnimatedReaction(
    derive,
    (current, previous) => {
      'worklet';
      // `previous` is null on the reaction's first run, which is the one that
      // replaces the caller's initial guess with a value read from the shared
      // state — it has to be allowed through, or a value that never moves
      // again would never arrive at all.
      if (previous === null || current !== previous) {
        runOnJS(setValue)(current);
      }
    },
    [derive],
  );

  return value;
}

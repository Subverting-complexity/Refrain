import { useMemo, useSyncExternalStore } from 'react';

/**
 * Subscribe to one *projection* of an engine's state, and re-render only when
 * that projection changes.
 *
 * ## Why this exists
 *
 * `useEngineSubscription` mirrors a whole snapshot into React state. That is
 * right for a consumer that needs all of it, and wrong for the player: the
 * audio engine publishes the playhead in the same object as the transport
 * status, so a component that only cares whether playback is running was
 * re-rendered ten times a second — and during a drag, at the drag's own
 * cadence.
 *
 * On the New Architecture that is not a cheap mistake. A React commit is
 * mounted on the Android UI thread inside the Choreographer's animation
 * callback, which is the same pass that has to finish before the frame can be
 * drawn. Measured on a 120Hz mid-range Android during a waveform drag, those
 * commits took that phase from 0.6ms to 5.4ms at the 90th percentile and
 * halved the number of frames the drag actually drew. It made no difference
 * that nothing on screen depended on the render: the cost is the commit, not
 * the pixels.
 *
 * So the rule this hook exists to enforce is: **a component subscribes to the
 * value it draws, at that value's own rate.** A screen that shows the play
 * button subscribes to the status. A clock subscribes to whole seconds, not to
 * milliseconds. Anything that has to move every frame does not come through
 * here at all — it belongs in a shared value, drawn on the UI thread. See
 * `useSharedProjection` for the bridge back from one of those.
 *
 * ## Contract
 *
 * `subscribe`, `getState` and `select` must all be stable references —
 * module-level exports, or wrapped in `useCallback`. They are dependencies, and
 * an inline arrow would rebuild the subscription or the cache on every render.
 *
 * `isEqual` decides what counts as a change; the default is `Object.is`, so a
 * selector returning a freshly built object needs one supplied or it will
 * report a change every time.
 */
/**
 * One component's cache of its selection, keyed on the snapshot it came from.
 *
 * React calls `getSnapshot` repeatedly — during render, and again while it
 * decides whether a store change is worth re-rendering for — and requires the
 * same reference back whenever nothing has changed, or it loops. So the
 * selector runs only when the engine hands over a genuinely new object, and an
 * unchanged projection keeps its identity, which is what lets a selector derive
 * one at all.
 *
 * Built here rather than inline in the hook because the cache is mutable state
 * that outlives the render which created it, and React may read it outside
 * render, where a ref write would be a side effect.
 */
function createSelectionCache<T, S>(
  getState: () => T,
  select: (state: T) => S,
  isEqual: (a: S, b: S) => boolean,
): () => S {
  let primed = false;
  let lastSource: T;
  let lastSelected: S;

  return (): S => {
    const source = getState();
    if (!primed) {
      primed = true;
      lastSource = source;
      lastSelected = select(source);
      return lastSelected;
    }
    if (Object.is(lastSource, source)) return lastSelected;

    lastSource = source;
    const selected = select(source);
    // Hold the previous reference when the projection is equivalent, so a
    // snapshot that moved a field this caller does not read cannot re-render
    // it. This is the whole point of the hook.
    if (!isEqual(lastSelected, selected)) lastSelected = selected;
    return lastSelected;
  };
}

export function useEngineSelector<T, S>(
  subscribe: (onChange: (state: T) => void) => () => void,
  getState: () => T,
  select: (state: T) => S,
  isEqual: (a: S, b: S) => boolean = Object.is,
): S {
  const getSelection = useMemo(
    () => createSelectionCache(getState, select, isEqual),
    [getState, select, isEqual],
  );

  return useSyncExternalStore(subscribe, getSelection, getSelection);
}

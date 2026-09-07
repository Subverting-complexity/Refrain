import { useEffect, useRef, useState } from 'react';

/**
 * Whether two engine snapshots carry the same values.
 *
 * Engines push a freshly built object on every change, so object identity says
 * nothing about whether anything moved. A flat comparison of the fields is what
 * can tell, and every state this hook mirrors is flat by construction: the
 * services layer publishes plain snapshots of scalars, never nested structures.
 * A non-object state (a number, a string) falls back to `Object.is`.
 */
function sameSnapshot<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  );
}

/**
 * Mirrors an engine's push-based state into React state.
 *
 * The services layer exposes `subscribe(cb) => unsubscribe` and pushes a fresh
 * snapshot on every change. Every consumer of that pattern was hand-rolling the
 * same `useState` + mount-effect pair; this collapses them into one call.
 *
 * A snapshot carrying values identical to the current one is dropped rather
 * than stored. The audio engine publishes on every native status update, which
 * on a loaded track is ten times a second whether or not anything moved, and
 * each of those objects is a new one — so without this the whole player screen
 * re-rendered at that rate for a transport sitting still.
 *
 * `subscribe` is a dependency, so pass a stable reference — a module-level
 * export such as `audioEngine.subscribe`, not an inline arrow. An unstable
 * reference would re-subscribe on every render.
 */
export function useEngineSubscription<T>(
  subscribe: (cb: (state: T) => void) => () => void,
  initialState: T,
): T {
  const [state, setState] = useState<T>(initialState);
  // The comparison happens here rather than inside a `setState` updater
  // because an updater that returns the current value only *usually* avoids a
  // render: React reserves the right to render the component once more before
  // bailing out. Not calling `setState` at all has no such caveat. Nothing
  // else writes the state, so the ref cannot fall behind it.
  const latest = useRef<T>(initialState);
  useEffect(
    () =>
      subscribe((next) => {
        // eslint-disable-next-line react-hooks/refs -- deferred engine callback, runs on notify not render
        if (sameSnapshot(latest.current, next)) return;
        latest.current = next;
        setState(next);
      }),
    [subscribe],
  );
  return state;
}

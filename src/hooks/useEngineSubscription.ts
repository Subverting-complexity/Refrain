import { useEffect, useState } from 'react';

/**
 * Mirrors an engine's push-based state into React state.
 *
 * The services layer exposes `subscribe(cb) => unsubscribe` and pushes a fresh
 * snapshot on every change. Every consumer of that pattern was hand-rolling the
 * same `useState` + mount-effect pair; this collapses them into one call.
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
  useEffect(() => subscribe(setState), [subscribe]);
  return state;
}

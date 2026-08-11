import { RefObject, useEffect, useRef } from 'react';

/**
 * Keeps the latest value of `value` in a ref so deferred callbacks — gesture
 * handlers, timers, event subscriptions — can read it without being rebuilt
 * (and re-subscribed) on every render.
 *
 * The write happens in an effect, never during render: a render-phase write
 * would make the ref observable mid-render, which breaks under concurrent
 * rendering and is what the `react-hooks/refs` lint rule guards against. The
 * consequence is that the ref lags by one commit *during* render — that is
 * fine for the intended use, where `.current` is only read after commit, from
 * a callback the user triggered.
 *
 * The effect intentionally has no dependency array so the ref tracks every
 * render, matching the hand-rolled copies this replaces.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

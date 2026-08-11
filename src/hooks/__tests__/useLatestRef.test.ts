import { createElement, RefObject } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useLatestRef } from '../useLatestRef';

let lastRef: RefObject<unknown>;
let renderValue: unknown;

function TestComponent({ value }: { value: unknown }) {
  const ref = useLatestRef(value);
  lastRef = ref;
  // Captured during render, before the commit-time write lands. Reading a ref
  // here is exactly what the rule forbids in product code — the point of the
  // assertion below is to pin down what that read would see.
  // eslint-disable-next-line react-hooks/refs -- deliberate: asserts the one-commit lag
  renderValue = ref.current;
  return null;
}

function render(value: unknown): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent, { value }));
  });
  return tree;
}

describe('useLatestRef', () => {
  it('seeds the ref with the initial value', () => {
    render('first');
    expect(lastRef.current).toBe('first');
  });

  it('holds the latest value after a re-render', () => {
    const tree = render('first');
    act(() => {
      tree.update(createElement(TestComponent, { value: 'second' }));
    });
    expect(lastRef.current).toBe('second');
  });

  it('returns the same ref object across renders', () => {
    const tree = render('first');
    const firstRef = lastRef;
    act(() => {
      tree.update(createElement(TestComponent, { value: 'second' }));
    });
    // Stability is the point: consumers list this ref in dependency arrays and
    // must not re-subscribe when the underlying value changes.
    expect(lastRef).toBe(firstRef);
  });

  it('tracks functions, so deferred callbacks never go stale', () => {
    const first = jest.fn();
    const second = jest.fn();
    const tree = render(first);

    act(() => {
      tree.update(createElement(TestComponent, { value: second }));
    });

    (lastRef.current as () => void)();
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });

  it('handles null and undefined values', () => {
    const tree = render(null);
    expect(lastRef.current).toBeNull();
    act(() => {
      tree.update(createElement(TestComponent, { value: undefined }));
    });
    expect(lastRef.current).toBeUndefined();
  });

  // The write is deliberately deferred to an effect rather than done during
  // render, so the ref is never mutated mid-render (React's `react-hooks/refs`
  // constraint). The visible consequence is a one-commit lag when read during
  // render — harmless for the intended post-commit callers.
  it('does not apply the new value during the render that supplied it', () => {
    const tree = render('first');
    act(() => {
      tree.update(createElement(TestComponent, { value: 'second' }));
    });
    expect(renderValue).toBe('first');
    expect(lastRef.current).toBe('second');
  });
});

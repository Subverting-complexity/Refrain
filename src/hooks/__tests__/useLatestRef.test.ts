import { createElement, useState } from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { useLatestRef } from '../useLatestRef';

let triggerUpdate: ((v: number) => void) | null = null;

function HookHost({
  value,
  onRef,
}: {
  value: number;
  onRef: (ref: { current: number }) => void;
}) {
  const ref = useLatestRef(value);
  onRef(ref);
  return null;
}

function Wrapper({ onRef }: { onRef: (ref: { current: number }) => void }) {
  const [val, setVal] = useState(1);
  triggerUpdate = setVal;
  return createElement(HookHost, { value: val, onRef });
}

describe('useLatestRef', () => {
  afterEach(() => {
    triggerUpdate = null;
  });

  it('returns a ref with the initial value', () => {
    let captured: { current: number } | undefined;

    act(() => {
      create(
        createElement(HookHost, {
          value: 7,
          onRef: (r) => {
            captured = r;
          },
        }),
      );
    });

    expect(captured?.current).toBe(7);
  });

  it('updates the ref when the value changes', () => {
    let captured: { current: number } | undefined;
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(
        createElement(Wrapper, {
          onRef: (r) => {
            captured = r;
          },
        }),
      );
    });

    expect(captured?.current).toBe(1);

    act(() => {
      triggerUpdate!(42);
    });

    expect(captured?.current).toBe(42);
    act(() => {
      renderer?.unmount();
    });
  });

  it('returns the same ref object across renders', () => {
    const refs: { current: number }[] = [];
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(
        createElement(Wrapper, {
          onRef: (r) => {
            refs.push(r);
          },
        }),
      );
    });

    act(() => {
      triggerUpdate!(2);
    });

    expect(refs.length).toBeGreaterThanOrEqual(2);
    expect(refs[0]).toBe(refs[refs.length - 1]);
    act(() => {
      renderer?.unmount();
    });
  });
});

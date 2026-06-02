import { act, create, ReactTestRenderer } from 'react-test-renderer';
import React from 'react';

import { useDragThrottle } from '../useDragThrottle';

type Handle = ReturnType<typeof useDragThrottle>;

// Render the hook inside a host component so it runs in a real React tree
// (hooks can only be called during render).
function renderDragThrottle(throttleMs?: number) {
  const ref: { current: Handle | null } = { current: null };
  function Host() {
    ref.current = useDragThrottle(throttleMs);
    return null;
  }
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(React.createElement(Host));
  });
  return { handle: () => ref.current as Handle, tree };
}

describe('useDragThrottle', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now');
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('fires immediately on begin', () => {
    const cb = jest.fn();
    const { handle } = renderDragThrottle();
    nowSpy.mockReturnValue(1000);

    act(() => handle().begin(100, cb));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(100);
  });

  it('throttles moves within the window and fires past it', () => {
    const cb = jest.fn();
    const { handle } = renderDragThrottle();

    nowSpy.mockReturnValue(1000);
    act(() => handle().begin(0, cb));
    expect(cb).toHaveBeenCalledTimes(1);

    // Two moves inside the 50ms window: no extra calls.
    nowSpy.mockReturnValue(1010);
    act(() => handle().move(10));
    nowSpy.mockReturnValue(1040);
    act(() => handle().move(20));
    expect(cb).toHaveBeenCalledTimes(1);

    // A move past the window fires once.
    nowSpy.mockReturnValue(1100);
    act(() => handle().move(30));
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(30);
  });

  it('commits the final value on end when not already fired', () => {
    const cb = jest.fn();
    const { handle } = renderDragThrottle();

    nowSpy.mockReturnValue(1000);
    act(() => handle().begin(0, cb));
    // Throttled move — value 75 not yet committed.
    nowSpy.mockReturnValue(1010);
    act(() => handle().move(75));
    expect(cb).toHaveBeenCalledTimes(1);

    act(() => handle().end());
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(75);
  });

  it('does not fire a redundant call on end after a pure begin', () => {
    const cb = jest.fn();
    const { handle } = renderDragThrottle();

    nowSpy.mockReturnValue(1000);
    act(() => handle().begin(50, cb));
    act(() => handle().end());

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(50);
  });

  it('does not re-fire on end when the final move already fired', () => {
    const cb = jest.fn();
    const { handle } = renderDragThrottle();

    nowSpy.mockReturnValue(1000);
    act(() => handle().begin(0, cb));
    nowSpy.mockReturnValue(1100);
    act(() => handle().move(30));
    expect(cb).toHaveBeenCalledTimes(2);

    act(() => handle().end());
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(30);
  });

  it('does nothing on end before any begin', () => {
    const cb = jest.fn();
    const { handle } = renderDragThrottle();
    act(() => handle().end());
    expect(cb).not.toHaveBeenCalled();
  });

  it('resets between gestures', () => {
    const cb = jest.fn();
    const { handle } = renderDragThrottle();

    nowSpy.mockReturnValue(1000);
    act(() => handle().begin(0, cb));
    act(() => handle().end());
    cb.mockClear();

    // A second gesture fires immediately again.
    nowSpy.mockReturnValue(2000);
    act(() => handle().begin(200, cb));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(200);
  });

  it('honors a custom throttle window', () => {
    const cb = jest.fn();
    const { handle } = renderDragThrottle(200);

    nowSpy.mockReturnValue(1000);
    act(() => handle().begin(0, cb));
    // 100ms later — within the 200ms custom window, no fire.
    nowSpy.mockReturnValue(1100);
    act(() => handle().move(10));
    expect(cb).toHaveBeenCalledTimes(1);
    // 200ms after begin — fires.
    nowSpy.mockReturnValue(1200);
    act(() => handle().move(20));
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

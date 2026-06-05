import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { TOAST_DURATION_MS, useToast } from '../useToast';

let lastResult: ReturnType<typeof useToast>;

function TestComponent() {
  lastResult = useToast();
  return null;
}

function renderTestHook(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent));
  });
  return tree;
}

describe('useToast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with no toast', () => {
    renderTestHook();
    expect(lastResult.toast).toBeNull();
  });

  it('shows a toast with the given message and default success variant', () => {
    renderTestHook();

    act(() => {
      lastResult.showToast('Track deleted');
    });

    expect(lastResult.toast).toEqual({
      message: 'Track deleted',
      variant: 'success',
    });
  });

  it('shows a toast with an explicit error variant', () => {
    renderTestHook();

    act(() => {
      lastResult.showToast('Import failed: bad file', 'error');
    });

    expect(lastResult.toast).toEqual({
      message: 'Import failed: bad file',
      variant: 'error',
    });
  });

  it('auto-dismisses after the default duration', () => {
    renderTestHook();

    act(() => {
      lastResult.showToast('Library refreshed');
    });
    expect(lastResult.toast).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(lastResult.toast).toBeNull();
  });

  it('hideToast clears the toast immediately', () => {
    renderTestHook();

    act(() => {
      lastResult.showToast('Track deleted');
    });
    act(() => {
      lastResult.hideToast();
    });

    expect(lastResult.toast).toBeNull();
  });

  it('latest showToast replaces the previous and resets the timer', () => {
    renderTestHook();

    act(() => {
      lastResult.showToast('First message');
    });
    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS - 1000);
    });

    act(() => {
      lastResult.showToast('Second message', 'error');
    });
    expect(lastResult.toast).toEqual({
      message: 'Second message',
      variant: 'error',
    });

    // The original timer would have fired here; the reset timer should not.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(lastResult.toast).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS - 1000);
    });
    expect(lastResult.toast).toBeNull();
  });

  it('clears its timer on unmount without dismissing state mid-flight', () => {
    const tree = renderTestHook();

    act(() => {
      lastResult.showToast('Track deleted');
    });

    act(() => {
      tree.unmount();
    });

    // No pending timer should fire after unmount.
    expect(() =>
      act(() => {
        jest.advanceTimersByTime(TOAST_DURATION_MS);
      }),
    ).not.toThrow();
  });
});

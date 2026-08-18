import { createElement } from 'react';
import { AccessibilityInfo } from 'react-native';
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

  describe('screen reader announcement', () => {
    let announceSpy: jest.SpyInstance;

    beforeEach(() => {
      announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      announceSpy.mockRestore();
    });

    it('announces the message when a toast is shown', () => {
      // Toast renders with accessibilityRole="alert", which does not reliably
      // announce on appearance — so raising a toast announces it here, rather
      // than leaving every caller to remember the pairing.
      renderTestHook();

      act(() => {
        lastResult.showToast('Track deleted');
      });

      expect(announceSpy).toHaveBeenCalledWith('Track deleted');
    });

    it('announces exactly what is displayed, for every variant', () => {
      renderTestHook();

      act(() => {
        lastResult.showToast('Import failed: bad file', 'error');
      });

      expect(announceSpy).toHaveBeenCalledWith('Import failed: bad file');
      expect(lastResult.toast?.message).toBe('Import failed: bad file');
    });

    it('announces each toast, including one that replaces another', () => {
      renderTestHook();

      act(() => {
        lastResult.showToast('First');
      });
      act(() => {
        lastResult.showToast('Second');
      });

      expect(announceSpy).toHaveBeenCalledTimes(2);
      expect(announceSpy).toHaveBeenLastCalledWith('Second');
    });

    it('does not announce on dismiss or auto-dismiss', () => {
      renderTestHook();

      act(() => {
        lastResult.showToast('Track deleted');
      });
      announceSpy.mockClear();

      act(() => {
        lastResult.hideToast();
      });
      act(() => {
        jest.advanceTimersByTime(TOAST_DURATION_MS);
      });

      expect(announceSpy).not.toHaveBeenCalled();
    });
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

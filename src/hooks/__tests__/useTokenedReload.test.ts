/**
 * The reload scaffolding both library screens share. The behaviour that
 * matters here is the token: a read the reader has moved on from must not
 * land, and must not report either — it is not a failure worth speaking
 * about, it is a question nobody is waiting on an answer to.
 */
import { createElement } from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';

import { useTokenedReload } from '../useTokenedReload';

let mockAnnounce: jest.SpyInstance;

// Captures the focus callback so a test can run it and its cleanup by hand.
let focusCallback: (() => void | (() => void)) | null = null;
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    focusCallback = cb;
  },
}));

type Options = Parameters<typeof useTokenedReload>[0];
type Result = ReturnType<typeof useTokenedReload>;

function setup(overrides: Partial<Options> = {}) {
  const load = jest.fn().mockResolvedValue('data');
  const onLoaded = jest.fn();
  const onError = jest.fn();
  const result = { current: null as unknown as Result };

  function TestComponent() {
    result.current = useTokenedReload({
      load,
      onLoaded,
      onError,
      announcement: 'Refreshed',
      loadFailureMessage: 'Failed to load',
      refreshFailureMessage: 'Failed to refresh',
      ...overrides,
    });
    return null;
  }

  act(() => {
    create(createElement(TestComponent));
  });
  return { result, load, onLoaded, onError };
}

beforeEach(() => {
  jest.clearAllMocks();
  focusCallback = null;
  mockAnnounce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  mockAnnounce.mockRestore();
});

describe('useTokenedReload', () => {
  it('applies a successful read without announcing it', async () => {
    const { result, onLoaded } = setup();

    await act(async () => {
      await result.current.reload();
    });

    expect(onLoaded).toHaveBeenCalledWith('data');
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it('reports a failed read with the load message', async () => {
    const load = jest.fn().mockRejectedValue(new Error('nope'));
    const { result, onError, onLoaded } = setup({ load });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.reload();
    });

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalledWith('Failed to load');
    expect(onLoaded).not.toHaveBeenCalled();
  });

  it('announces a pull-to-refresh and reports its own failure message', async () => {
    const { result, onError } = setup();

    await act(async () => {
      await result.current.handleRefresh();
    });
    expect(mockAnnounce).toHaveBeenCalledWith('Refreshed');

    const failing = setup({
      load: jest.fn().mockRejectedValue(new Error('nope')),
    });
    await act(async () => {
      await failing.result.current.handleRefresh();
    });
    expect(failing.onError).toHaveBeenCalledWith('Failed to refresh');
    expect(onError).not.toHaveBeenCalled();
  });

  it('tracks whether a refresh is in flight', async () => {
    let release: (value: string) => void = () => undefined;
    const load = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = setup({ load });

    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.handleRefresh();
    });
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      release('data');
      await refreshing;
    });
    expect(result.current.refreshing).toBe(false);
  });

  // The reason the token exists: a read started before an edit holds a
  // snapshot that predates it, so letting it land would undo the edit.
  it('drops a read that was invalidated while in flight', async () => {
    let release: (value: string) => void = () => undefined;
    const load = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const { result, onLoaded } = setup({ load });

    let reloading!: Promise<boolean>;
    act(() => {
      reloading = result.current.reload();
    });
    act(() => {
      result.current.invalidateLoads();
    });

    let ok: boolean | undefined;
    await act(async () => {
      release('stale');
      ok = await reloading;
    });

    expect(onLoaded).not.toHaveBeenCalled();
    // Superseded, not failed — a caller must not report it as an error.
    expect(ok).toBe(true);
  });

  it('stays silent when an invalidated read fails', async () => {
    let fail: (err: Error) => void = () => undefined;
    const load = jest.fn(
      () =>
        new Promise<string>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const { result, onError } = setup({ load });

    let reloading!: Promise<boolean>;
    act(() => {
      reloading = result.current.reload();
    });
    act(() => {
      result.current.invalidateLoads();
    });

    let ok: boolean | undefined;
    await act(async () => {
      fail(new Error('nope'));
      ok = await reloading;
    });

    expect(onError).not.toHaveBeenCalled();
    expect(ok).toBe(true);
  });

  it('reads on focus and retires the read when the screen is left', async () => {
    let release: (value: string) => void = () => undefined;
    const load = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const { onLoaded } = setup({ load });

    let cleanup: void | (() => void);
    act(() => {
      cleanup = focusCallback?.();
    });
    expect(load).toHaveBeenCalled();

    // Leaving the screen retires the in-flight read.
    act(() => {
      (cleanup as () => void)?.();
    });
    await act(async () => {
      release('late');
    });

    expect(onLoaded).not.toHaveBeenCalled();
  });
});

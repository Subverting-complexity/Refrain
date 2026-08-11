import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useSnippetPreview } from '../useSnippetPreview';

const mockGetSnippetPreviewEnabled = jest.fn<boolean, []>();
const mockSetSnippetPreviewEnabled = jest.fn<void, [boolean]>();
const mockHydrateSettings = jest.fn<Promise<void>, []>();

jest.mock('../../services/snippetPreviewStore', () => ({
  getSnippetPreviewEnabled: () => mockGetSnippetPreviewEnabled(),
  setSnippetPreviewEnabled: (enabled: boolean) =>
    mockSetSnippetPreviewEnabled(enabled),
}));

jest.mock('../../services/settingsStore', () => ({
  hydrateSettings: () => mockHydrateSettings(),
}));

let lastResult: ReturnType<typeof useSnippetPreview>;

function TestComponent() {
  lastResult = useSnippetPreview();
  return null;
}

// Async act so the post-hydration re-seed effect (a resolved-promise
// microtask) flushes before assertions.
async function renderHook(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(TestComponent));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSnippetPreviewEnabled.mockReturnValue(true);
  mockHydrateSettings.mockResolvedValue(undefined);
});

describe('useSnippetPreview', () => {
  it('seeds the initial value from the store (defaults ON)', async () => {
    await renderHook();
    expect(lastResult.snippetPreviewEnabled).toBe(true);
    // Seeded via the lazy initializer, then re-read once after hydration.
    expect(mockGetSnippetPreviewEnabled).toHaveBeenCalled();
  });

  it('reflects a persisted-off value on mount', async () => {
    mockGetSnippetPreviewEnabled.mockReturnValue(false);
    await renderHook();
    expect(lastResult.snippetPreviewEnabled).toBe(false);
  });

  it('updates state and persists when toggled', async () => {
    await renderHook();

    act(() => {
      lastResult.setSnippetPreviewEnabled(false);
    });

    expect(lastResult.snippetPreviewEnabled).toBe(false);
    expect(mockSetSnippetPreviewEnabled).toHaveBeenCalledWith(false);
  });

  // Regression for #186: the identical settingsStore write in useSkipInterval
  // is guarded, so a storage throw here must not escape into the toggle's
  // press handler either.
  it('does not throw out of the setter when the persist write fails', async () => {
    await renderHook();
    mockSetSnippetPreviewEnabled.mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => {
      act(() => {
        lastResult.setSnippetPreviewEnabled(false);
      });
    }).not.toThrow();
  });

  it('still applies the new value in memory when the persist write fails', async () => {
    await renderHook();
    mockSetSnippetPreviewEnabled.mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    act(() => {
      lastResult.setSnippetPreviewEnabled(false);
    });

    expect(lastResult.snippetPreviewEnabled).toBe(false);
  });

  // Regression for #163: on a cold web load the first synchronous seed can
  // read an unhydrated cache and fall back to the default-on. Once hydration
  // resolves, the hook re-reads and reapplies the persisted-off value.
  it('reapplies a persisted-off value the cold-load seed missed', async () => {
    mockGetSnippetPreviewEnabled
      .mockReturnValueOnce(true) // lazy seed: cache still empty, default ON
      .mockReturnValue(false); // post-hydration read: real persisted value

    await renderHook();

    expect(lastResult.snippetPreviewEnabled).toBe(false);
    expect(mockHydrateSettings).toHaveBeenCalledTimes(1);
  });
});

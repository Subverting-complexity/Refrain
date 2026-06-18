import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useSnippetPreview } from '../useSnippetPreview';

const mockGetSnippetPreviewEnabled = jest.fn<boolean, []>();
const mockSetSnippetPreviewEnabled = jest.fn<void, [boolean]>();

jest.mock('../../services/snippetPreviewStore', () => ({
  getSnippetPreviewEnabled: () => mockGetSnippetPreviewEnabled(),
  setSnippetPreviewEnabled: (enabled: boolean) =>
    mockSetSnippetPreviewEnabled(enabled),
}));

let lastResult: ReturnType<typeof useSnippetPreview>;

function TestComponent() {
  lastResult = useSnippetPreview();
  return null;
}

function renderHook(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSnippetPreviewEnabled.mockReturnValue(true);
});

describe('useSnippetPreview', () => {
  it('seeds the initial value from the store (defaults ON)', () => {
    renderHook();
    expect(lastResult.snippetPreviewEnabled).toBe(true);
    // Seeded exactly once via the lazy initializer.
    expect(mockGetSnippetPreviewEnabled).toHaveBeenCalledTimes(1);
  });

  it('reflects a persisted-off value on mount', () => {
    mockGetSnippetPreviewEnabled.mockReturnValue(false);
    renderHook();
    expect(lastResult.snippetPreviewEnabled).toBe(false);
  });

  it('updates state and persists when toggled', () => {
    renderHook();

    act(() => {
      lastResult.setSnippetPreviewEnabled(false);
    });

    expect(lastResult.snippetPreviewEnabled).toBe(false);
    expect(mockSetSnippetPreviewEnabled).toHaveBeenCalledWith(false);
  });
});

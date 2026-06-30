import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SKIP_PRESETS, useSkipInterval } from '../useSkipInterval';

const mockGetNumber = jest.fn<number, [string, number]>();
const mockSetNumber = jest.fn<void, [string, number]>();

jest.mock('../../services/settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
}));

let lastResult: ReturnType<typeof useSkipInterval>;

function TestComponent() {
  lastResult = useSkipInterval();
  return null;
}

function renderTestHook(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNumber.mockImplementation((_key, fallback) => fallback);
});

describe('useSkipInterval', () => {
  it('defaults to 5 seconds (5000ms)', () => {
    renderTestHook();
    expect(lastResult.skipSeconds).toBe(5);
    expect(lastResult.skipMs).toBe(5000);
  });

  it('hydrates a persisted preset on mount', () => {
    mockGetNumber.mockReturnValue(10);
    renderTestHook();
    expect(lastResult.skipSeconds).toBe(10);
    expect(lastResult.skipMs).toBe(10000);
  });

  it('falls back to the default for a non-preset stored value', () => {
    mockGetNumber.mockReturnValue(7);
    renderTestHook();
    expect(lastResult.skipSeconds).toBe(5);
  });

  it('persists and updates when a new amount is set', () => {
    renderTestHook();
    act(() => {
      lastResult.setSkipSeconds(15);
    });
    expect(lastResult.skipSeconds).toBe(15);
    expect(lastResult.skipMs).toBe(15000);
    expect(mockSetNumber).toHaveBeenCalledWith('playback.skipSeconds', 15);
  });

  it('falls back to the default when reading from storage throws', () => {
    mockGetNumber.mockImplementation(() => {
      throw new Error('db unavailable');
    });
    renderTestHook();
    expect(lastResult.skipSeconds).toBe(5);
  });

  it('does not throw when persisting fails', () => {
    mockSetNumber.mockImplementation(() => {
      throw new Error('write failed');
    });
    renderTestHook();
    expect(() => {
      act(() => {
        lastResult.setSkipSeconds(10);
      });
    }).not.toThrow();
    expect(lastResult.skipSeconds).toBe(10);
  });

  it('exposes the selectable presets', () => {
    expect(SKIP_PRESETS).toEqual([1, 3, 5, 10, 15, 30]);
  });
});

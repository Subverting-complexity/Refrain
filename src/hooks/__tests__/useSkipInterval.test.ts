import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useSkipInterval } from '../useSkipInterval';

const mockGetSkipSeconds = jest.fn<number, []>();
const mockSetSkipSeconds = jest.fn<number, [number]>();
const mockSanitize = jest.fn<number, [number]>();

jest.mock('../../services/skipIntervalStore', () => ({
  DEFAULT_SKIP_SECONDS: 5,
  getSkipSeconds: () => mockGetSkipSeconds(),
  setSkipSeconds: (seconds: number) => mockSetSkipSeconds(seconds),
  sanitize: (seconds: number) => mockSanitize(seconds),
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
  mockGetSkipSeconds.mockReturnValue(5);
  // The service normalizes; the hook forwards the result, so pass through.
  mockSanitize.mockImplementation((seconds) => seconds);
  mockSetSkipSeconds.mockImplementation((seconds) => seconds);
});

describe('useSkipInterval', () => {
  it('defaults to 5 seconds (5000ms)', () => {
    renderTestHook();
    expect(lastResult.skipSeconds).toBe(5);
    expect(lastResult.skipMs).toBe(5000);
  });

  it('hydrates the persisted amount from the service on mount', () => {
    mockGetSkipSeconds.mockReturnValue(10);
    renderTestHook();
    expect(lastResult.skipSeconds).toBe(10);
    expect(lastResult.skipMs).toBe(10000);
  });

  it('normalizes and persists via the service when a new amount is set', () => {
    renderTestHook();
    act(() => {
      lastResult.setSkipSeconds(15);
    });
    expect(mockSanitize).toHaveBeenCalledWith(15);
    expect(lastResult.skipSeconds).toBe(15);
    expect(lastResult.skipMs).toBe(15000);
    expect(mockSetSkipSeconds).toHaveBeenCalledWith(15);
  });

  it('falls back to the default when the service read throws', () => {
    mockGetSkipSeconds.mockImplementation(() => {
      throw new Error('db unavailable');
    });
    renderTestHook();
    expect(lastResult.skipSeconds).toBe(5);
  });

  it('does not throw when persisting fails', () => {
    mockSetSkipSeconds.mockImplementation(() => {
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
});

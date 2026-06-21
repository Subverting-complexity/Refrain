import { createElement } from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { useWaveformData } from '../useWaveformData';

const mockExtractPeaks = jest.fn<Promise<number[]>, [string, number?]>();

jest.mock('../../services/waveformAnalyzer', () => ({
  extractPeaks: (...args: [string, number?]) => mockExtractPeaks(...args),
}));

let lastResult: ReturnType<typeof useWaveformData>;

function TestComponent({ uri }: { uri: string | null }) {
  lastResult = useWaveformData(uri);
  return null;
}

function renderHook(uri: string | null): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent, { uri }));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useWaveformData', () => {
  it('returns empty peaks and not loading when uri is null', () => {
    renderHook(null);

    expect(lastResult.peaks).toEqual([]);
    expect(lastResult.isLoading).toBe(false);
  });

  it('loads peaks for a valid uri', async () => {
    const fakePeaks = [0.1, 0.5, 1.0, 0.7, 0.3];
    mockExtractPeaks.mockResolvedValue(fakePeaks);

    renderHook('file:///test.wav');

    expect(lastResult.isLoading).toBe(true);

    await act(async () => {
      await mockExtractPeaks.mock.results[0].value;
    });

    expect(lastResult.isLoading).toBe(false);
    expect(lastResult.peaks).toEqual(fakePeaks);
    expect(mockExtractPeaks).toHaveBeenCalledWith('file:///test.wav');
  });

  it('resets peaks when uri changes to null', async () => {
    const fakePeaks = [0.2, 0.8];
    mockExtractPeaks.mockResolvedValue(fakePeaks);

    const tree = renderHook('file:///test.wav');

    await act(async () => {
      await mockExtractPeaks.mock.results[0].value;
    });

    expect(lastResult.peaks).toEqual(fakePeaks);

    act(() => {
      tree.update(createElement(TestComponent, { uri: null }));
    });

    expect(lastResult.peaks).toEqual([]);
  });

  it('returns empty peaks on extraction failure', async () => {
    mockExtractPeaks.mockRejectedValue(new Error('read failed'));

    renderHook('file:///bad.wav');

    await act(async () => {
      try {
        await mockExtractPeaks.mock.results[0].value;
      } catch {
        // expected
      }
    });

    expect(lastResult.isLoading).toBe(false);
    expect(lastResult.peaks).toEqual([]);
  });

  it('clears peaks and shows loading while a newly selected track loads', async () => {
    const firstPeaks = [0.2, 0.8];
    let resolveSecond!: (v: number[]) => void;
    const secondPromise = new Promise<number[]>((r) => {
      resolveSecond = r;
    });

    mockExtractPeaks
      .mockResolvedValueOnce(firstPeaks)
      .mockReturnValueOnce(secondPromise);

    const tree = renderHook('file:///first.wav');

    await act(async () => {
      await mockExtractPeaks.mock.results[0].value;
    });
    expect(lastResult.peaks).toEqual(firstPeaks);
    expect(lastResult.isLoading).toBe(false);

    // Switching tracks must not leave the previous track's waveform on screen:
    // peaks clear immediately and the control reads as loading until the new
    // track's peaks arrive.
    act(() => {
      tree.update(createElement(TestComponent, { uri: 'file:///second.wav' }));
    });
    expect(lastResult.peaks).toEqual([]);
    expect(lastResult.isLoading).toBe(true);

    const secondPeaks = [0.9, 0.1];
    await act(async () => {
      resolveSecond(secondPeaks);
    });
    expect(lastResult.peaks).toEqual(secondPeaks);
    expect(lastResult.isLoading).toBe(false);
  });

  it('ignores stale results when uri changes quickly', async () => {
    let resolveFirst!: (v: number[]) => void;
    const firstPromise = new Promise<number[]>((r) => {
      resolveFirst = r;
    });
    const secondPeaks = [0.9, 0.1];

    mockExtractPeaks
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(secondPeaks);

    const tree = renderHook('file:///first.wav');

    act(() => {
      tree.update(createElement(TestComponent, { uri: 'file:///second.wav' }));
    });

    await act(async () => {
      await mockExtractPeaks.mock.results[1].value;
    });

    expect(lastResult.peaks).toEqual(secondPeaks);

    await act(async () => {
      resolveFirst([0.5, 0.5]);
    });

    expect(lastResult.peaks).toEqual(secondPeaks);
  });
});

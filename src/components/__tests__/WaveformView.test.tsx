import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { WaveformView } from '../WaveformView';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        accentText: '#111d1f',
        border: '#2a4a4e',
        surface: '#1a2e30',
        textSecondary: '#8ba89e',
      },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
      typography: {},
    },
  }),
}));

// Stub gesture-handler: GestureDetector renders its child, and Gesture.Pan()
// returns a fluent recorder so the test can invoke the begin/update/finalize
// callbacks directly with synthetic { x } events — the same surface the native
// handler drives on a device.
jest.mock('react-native-gesture-handler', () => {
  let last: { handlers: Record<string, (e: unknown) => void> } | null = null;
  const makePan = () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const api = {
      runOnJS: () => api,
      minDistance: () => api,
      enabled: () => api,
      onBegin: (f: (e: unknown) => void) => {
        handlers.begin = f;
        return api;
      },
      onStart: (f: (e: unknown) => void) => {
        handlers.start = f;
        return api;
      },
      onUpdate: (f: (e: unknown) => void) => {
        handlers.update = f;
        return api;
      },
      onEnd: (f: (e: unknown) => void) => {
        handlers.end = f;
        return api;
      },
      onFinalize: (f: (e: unknown) => void) => {
        handlers.finalize = f;
        return api;
      },
    };
    last = { handlers };
    return api;
  };
  return {
    Gesture: { Pan: makePan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    __getHandlers: () => last?.handlers,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNGH = require('react-native-gesture-handler');
const handlers = () => RNGH.__getHandlers();

const DEFAULT_PEAKS = [0.2, 0.5, 0.8, 1.0, 0.6];

function findBars(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.type === 'View' &&
      node.props.style &&
      Array.isArray(node.props.style) &&
      node.props.style.some(
        (s: Record<string, unknown>) => s && typeof s.height === 'string',
      ),
  );
}

function renderWaveform(
  props: Partial<React.ComponentProps<typeof WaveformView>> = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <WaveformView
        peaks={DEFAULT_PEAKS}
        positionMs={0}
        durationMs={10000}
        onSeek={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

function getTouchArea(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) => node.type === 'View' && typeof node.props.onLayout === 'function',
  )[0];
}

function layout(tree: ReactTestRenderer, width = 300) {
  const touchArea = getTouchArea(tree);
  act(() => {
    touchArea.props.onLayout({ nativeEvent: { layout: { width } } });
  });
}

function begin(x: number) {
  act(() => handlers().begin({ x }));
}
function move(x: number) {
  act(() => handlers().update({ x }));
}
function finalize() {
  act(() => handlers().finalize({}));
}

describe('WaveformView', () => {
  it('renders bars for each peak', () => {
    const tree = renderWaveform();
    const bars = findBars(tree);
    expect(bars).toHaveLength(DEFAULT_PEAKS.length);
  });

  it('colors bars based on playback progress', () => {
    const tree = renderWaveform({ positionMs: 5000 });
    const bars = findBars(tree);

    const accentBars = bars.filter((b) =>
      b.props.style.some(
        (s: Record<string, unknown>) => s.backgroundColor === '#7edbb8',
      ),
    );
    const borderBars = bars.filter((b) =>
      b.props.style.some(
        (s: Record<string, unknown>) => s.backgroundColor === '#2a4a4e',
      ),
    );

    expect(accentBars.length).toBeGreaterThan(0);
    expect(borderBars.length).toBeGreaterThan(0);
  });

  it('renders a cursor element', () => {
    const tree = renderWaveform({ positionMs: 2500 });

    const cursors = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        node.props.style &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (s: Record<string, unknown>) =>
            s && s.left === '25%' && s.backgroundColor === '#7edbb8',
        ),
    );

    expect(cursors).toHaveLength(1);
  });

  it('renders nothing when peaks is empty', () => {
    const tree = renderWaveform({ peaks: [] });
    const bars = findBars(tree);
    expect(bars).toHaveLength(0);
  });

  it('sets accessibility role and label', () => {
    const tree = renderWaveform({ positionMs: 5000, durationMs: 120000 });

    const container = tree.root.findAll(
      (node) =>
        node.type === 'View' && node.props.accessibilityRole === 'adjustable',
    );

    expect(container).toHaveLength(1);
    expect(container[0].props.accessibilityLabel).toContain('0:05');
    expect(container[0].props.accessibilityLabel).toContain('2:00');
  });

  it('includes loop range in accessibility label when markers set', () => {
    const tree = renderWaveform({
      positionMs: 5000,
      durationMs: 120000,
      markerA: 10000,
      markerB: 30000,
    });

    const container = tree.root.findAll(
      (node) =>
        node.type === 'View' && node.props.accessibilityRole === 'adjustable',
    );

    expect(container[0].props.accessibilityLabel).toContain(
      'Loop from 0:10 to 0:30',
    );
  });

  it('calls onSeek when touch area is tapped', () => {
    const onSeek = jest.fn();
    const tree = renderWaveform({ onSeek });
    layout(tree);

    begin(150);

    expect(onSeek).toHaveBeenCalledWith(5000);
  });

  it('maps a tap at the bars left edge to position 0 (padding-aware)', () => {
    const onSeek = jest.fn();
    const tree = renderWaveform({ onSeek, durationMs: 10000 });
    layout(tree);

    // The bars start HORIZONTAL_PADDING (spacing.md = 12) in from the edge,
    // so a tap there is the start of the track, not a positive offset.
    begin(12);

    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it('maps a tap at the bars right edge to the full duration', () => {
    const onSeek = jest.fn();
    const tree = renderWaveform({ onSeek, durationMs: 10000 });
    layout(tree);

    // Right edge of the bars sits at width - HORIZONTAL_PADDING = 288.
    begin(288);

    expect(onSeek).toHaveBeenCalledWith(10000);
  });

  it('renders A/B marker lines when provided', () => {
    const tree = renderWaveform({ markerA: 2000, markerB: 8000 });

    const markerLines = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        node.props.style &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (s: Record<string, unknown>) => s && s.backgroundColor === '#8ba89e',
        ) &&
        node.props.style.some(
          (s: Record<string, unknown>) => s && s.width === 2 && s.top === 0,
        ),
    );

    expect(markerLines).toHaveLength(2);
  });

  it('renders labelled grab handles for the markers', () => {
    const tree = renderWaveform({ markerA: 2000, markerB: 8000 });

    const handleLabels = tree.root
      .findAll((node) => node.type === 'Text')
      .map((n) => n.props.children)
      .filter((c) => c === 'A' || c === 'B');

    expect(handleLabels).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('renders highlighted region between A/B markers', () => {
    const tree = renderWaveform({ markerA: 2000, markerB: 8000 });

    const regions = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        node.props.style &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (s: Record<string, unknown>) =>
            s && typeof s.width === 'string' && s.width === '60%',
        ),
    );

    expect(regions).toHaveLength(1);
  });

  it('adds accessibility labels to marker lines', () => {
    const tree = renderWaveform({ markerA: 2000, markerB: 8000 });

    const markerALabel = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        node.props.accessibilityLabel &&
        node.props.accessibilityLabel.includes('Loop start marker'),
    );
    const markerBLabel = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        node.props.accessibilityLabel &&
        node.props.accessibilityLabel.includes('Loop end marker'),
    );

    expect(markerALabel).toHaveLength(1);
    expect(markerBLabel).toHaveLength(1);
  });

  describe('marker dragging', () => {
    it('calls onMarkerAChange when touch starts near markerA', () => {
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
        onSeek,
      });
      layout(tree);

      begin(152);

      expect(onMarkerAChange).toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('calls onMarkerBChange when touch starts near markerB', () => {
      const onMarkerBChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 2000,
        markerB: 8000,
        durationMs: 10000,
        onMarkerBChange,
        onSeek,
      });
      layout(tree);

      begin(242);

      expect(onMarkerBChange).toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('continues dragging marker on move after grant near marker', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
        onSeek,
      });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(150);
      onMarkerAChange.mockClear();

      // Advance past the throttle window so the move commits a native call.
      nowSpy.mockReturnValue(1100);
      move(180);

      // Bars are inset by HORIZONTAL_PADDING (spacing.md = 12) on each side,
      // so the track spans 276px: (180 - 12) / 276 * 10000 = 6087ms.
      expect(onMarkerAChange).toHaveBeenCalledWith(6087);
      expect(onSeek).not.toHaveBeenCalled();
      nowSpy.mockRestore();
    });

    it('clamps the B handle so it cannot be dragged before marker A', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      const onMarkerBChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 2000,
        markerB: 8000,
        durationMs: 10000,
        onMarkerBChange,
        onSeek,
      });
      layout(tree);

      // Grab the B handle (markerB X ≈ 233px on a 276px track).
      nowSpy.mockReturnValue(1000);
      begin(233);
      onMarkerBChange.mockClear();

      // Drag well before A; the value must clamp to just past A (2001ms),
      // never to or below A.
      nowSpy.mockReturnValue(1100);
      move(30);

      expect(onMarkerBChange).toHaveBeenCalledWith(2001);
      onMarkerBChange.mock.calls.forEach(([ms]) => {
        expect(ms).toBeGreaterThan(2000);
      });
      nowSpy.mockRestore();
    });

    it('clamps the A handle so it cannot be dragged past marker B', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 2000,
        markerB: 8000,
        durationMs: 10000,
        onMarkerAChange,
        onSeek,
      });
      layout(tree);

      // Grab the A handle (markerA X ≈ 67px on a 276px track).
      nowSpy.mockReturnValue(1000);
      begin(67);
      onMarkerAChange.mockClear();

      // Drag well past B; the value must clamp to just before B (7999ms),
      // never to or beyond B.
      nowSpy.mockReturnValue(1100);
      move(270);

      expect(onMarkerAChange).toHaveBeenCalledWith(7999);
      onMarkerAChange.mock.calls.forEach(([ms]) => {
        expect(ms).toBeLessThan(8000);
      });
      nowSpy.mockRestore();
    });

    it('picks the closer marker when both are within hit range', () => {
      const onMarkerAChange = jest.fn();
      const onMarkerBChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 4500,
        markerB: 5500,
        durationMs: 10000,
        onMarkerAChange,
        onMarkerBChange,
        onSeek,
      });
      layout(tree);

      // A pixel ≈ 12 + (4500/10000)*276 = 136.2
      // B pixel ≈ 12 + (5500/10000)*276 = 163.8
      // Touch at 155 is closer to B (8.8px) than A (18.8px).
      begin(155);

      expect(onMarkerBChange).toHaveBeenCalled();
      expect(onMarkerAChange).not.toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('falls back to seek when touch is not near any marker', () => {
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
        onSeek,
      });
      layout(tree);

      begin(30);

      expect(onSeek).toHaveBeenCalled();
      expect(onMarkerAChange).not.toHaveBeenCalled();
    });

    it('does not drag markers when callbacks are not provided', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onSeek,
      });
      layout(tree);

      begin(150);

      expect(onSeek).toHaveBeenCalled();
    });
  });

  function getAdjustable(tree: ReactTestRenderer) {
    return tree.root.findAll(
      (node) =>
        node.type === 'View' && node.props.accessibilityRole === 'adjustable',
    )[0];
  }

  describe('seek/marker throttling during drag', () => {
    let nowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      nowSpy = jest.spyOn(Date, 'now');
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('throttles native seeks during rapid drag moves', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(12);
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenLastCalledWith(0);

      // Two moves within the throttle window: no extra native seeks.
      nowSpy.mockReturnValue(1010);
      move(60);
      nowSpy.mockReturnValue(1020);
      move(90);
      expect(onSeek).toHaveBeenCalledTimes(1);

      // A move past the throttle window fires one native seek.
      nowSpy.mockReturnValue(1100);
      move(150);
      expect(onSeek).toHaveBeenCalledTimes(2);
    });

    it('keeps the cursor visual smooth while seeks are throttled', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        positionMs: 0,
        durationMs: 10000,
        onSeek,
      });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(12);
      // Throttled move (within window): no native seek, but visual advances.
      nowSpy.mockReturnValue(1010);
      move(150);
      expect(onSeek).toHaveBeenCalledTimes(1);
      // (150 - 12) / 276 * 100 ≈ 50% even though no native seek fired.
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(50);
    });

    it('fires one final unthrottled seek on release', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(12);
      // Throttled move — final position must still commit on release.
      nowSpy.mockReturnValue(1010);
      move(150);
      expect(onSeek).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1020);
      finalize();
      expect(onSeek).toHaveBeenCalledTimes(2);
    });

    it('does not fire a redundant seek on release after a pure tap', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(150);
      finalize();

      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenCalledWith(5000);
    });

    it('throttles marker updates and commits the final one on release', () => {
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
        onSeek,
      });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(150);
      expect(onMarkerAChange).toHaveBeenCalledTimes(1);

      // Throttled move within the window — no extra native call yet.
      nowSpy.mockReturnValue(1010);
      move(180);
      expect(onMarkerAChange).toHaveBeenCalledTimes(1);

      // Release commits the final marker position.
      nowSpy.mockReturnValue(1020);
      finalize();
      expect(onMarkerAChange).toHaveBeenCalledTimes(2);
      expect(onMarkerAChange).toHaveBeenLastCalledWith(6087);
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('clears the drag visual when the gesture finalizes', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        positionMs: 0,
        durationMs: 10000,
        onSeek,
      });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      begin(288);
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(100);

      finalize();
      // dragMs cleared → falls back to positionMs prop (0).
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(0);
    });
  });

  describe('accessibility actions', () => {
    it('exposes increment and decrement actions', () => {
      const tree = renderWaveform();
      const container = getAdjustable(tree);
      expect(container.props.accessibilityActions).toEqual([
        { name: 'increment' },
        { name: 'decrement' },
      ]);
    });

    it('announces progress as a percentage via accessibilityValue', () => {
      const tree = renderWaveform({ positionMs: 5000, durationMs: 20000 });
      const container = getAdjustable(tree);
      expect(container.props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 25,
      });
    });

    it('seeks forward 5s on increment', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        positionMs: 5000,
        durationMs: 20000,
        onSeek,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'increment' },
        });
      });
      expect(onSeek).toHaveBeenCalledWith(10000);
    });

    it('seeks back 5s on decrement', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        positionMs: 8000,
        durationMs: 20000,
        onSeek,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'decrement' },
        });
      });
      expect(onSeek).toHaveBeenCalledWith(3000);
    });

    it('clamps increment to duration', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        positionMs: 18000,
        durationMs: 20000,
        onSeek,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'increment' },
        });
      });
      expect(onSeek).toHaveBeenCalledWith(20000);
    });

    it('clamps decrement to zero', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        positionMs: 2000,
        durationMs: 20000,
        onSeek,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'decrement' },
        });
      });
      expect(onSeek).toHaveBeenCalledWith(0);
    });

    it('ignores actions when duration is zero', () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({ positionMs: 0, durationMs: 0, onSeek });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'increment' },
        });
      });
      expect(onSeek).not.toHaveBeenCalled();
    });
  });

  it('accepts style prop override', () => {
    const tree = renderWaveform({ style: { marginTop: 20 } });

    const container = tree.root.findAll(
      (node) =>
        node.type === 'View' && node.props.accessibilityRole === 'adjustable',
    );

    const flatStyle = container[0].props.style;
    const hasMarginTop = flatStyle.some(
      (s: Record<string, unknown>) => s && s.marginTop === 20,
    );
    expect(hasMarginTop).toBe(true);
  });
});

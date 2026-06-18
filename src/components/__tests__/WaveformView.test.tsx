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
        textPrimary: '#e8f5f0',
        textSecondary: '#8ba89e',
        markerA: '#ffb02e',
        markerAText: '#3a2600',
        markerB: '#ff5d77',
        markerBText: '#ffffff',
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

// Default y of 0 puts the touch in the top half (where A's flag lives); tests
// that exercise the A/B vertical split pass an explicit y.
function begin(x: number, y = 0) {
  act(() => handlers().begin({ x, y }));
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

  // Bars are tinted by appending an alpha byte to the accent hex. Played bars
  // sit at a high alpha (>= 0.5 base); unplayed/dull bars at a low one.
  function barAlpha(bar: ReturnType<typeof findBars>[number]): number {
    const styled = bar.props.style.find(
      (s: Record<string, unknown>) =>
        typeof s?.backgroundColor === 'string' &&
        (s.backgroundColor as string).startsWith('#7edbb8'),
    ) as { backgroundColor: string } | undefined;
    if (!styled) return 0;
    return parseInt(styled.backgroundColor.slice(7, 9), 16);
  }

  it('colors bars based on playback progress', () => {
    const tree = renderWaveform({ positionMs: 5000 });
    const bars = findBars(tree);

    // progress = 0.5; bar centres are (i+0.5)/5 → 0.1, 0.3, 0.5 played and
    // 0.7, 0.9 unplayed.
    const played = bars.filter((b) => barAlpha(b) >= 128);
    const dull = bars.filter((b) => barAlpha(b) < 128);

    expect(played).toHaveLength(3);
    expect(dull).toHaveLength(2);
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
            s && s.left === '25%' && s.backgroundColor === '#e8f5f0',
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

  it('renders A/B marker lines in their marker colors', () => {
    const tree = renderWaveform({ markerA: 2000, markerB: 8000 });

    const markerLine = (color: string) =>
      tree.root.findAll(
        (node) =>
          node.type === 'View' &&
          node.props.style &&
          Array.isArray(node.props.style) &&
          node.props.style.some(
            (s: Record<string, unknown>) => s && s.width === 2,
          ) &&
          node.props.style.some(
            (s: Record<string, unknown>) => s && s.backgroundColor === color,
          ),
      );

    expect(markerLine('#ffb02e')).toHaveLength(1);
    expect(markerLine('#ff5d77')).toHaveLength(1);
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

    it('disambiguates overlapping markers by vertical half (top → A)', () => {
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

      // Both handles are within the horizontal hit zone of x=150; a touch in
      // the top half (y=10) grabs A (its flag sits at the top).
      begin(150, 10);

      expect(onMarkerAChange).toHaveBeenCalled();
      expect(onMarkerBChange).not.toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('disambiguates overlapping markers by vertical half (bottom → B)', () => {
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

      // A touch in the bottom half (y=120) grabs B (its flag sits at the
      // bottom), even though both handles overlap horizontally.
      begin(150, 120);

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

    it('only seeks on an unarmed tap, even with no markers', () => {
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        durationMs: 10000,
        placeMode: 'none',
        onMarkerAChange,
        onSeek,
      });
      layout(tree);

      begin(150);

      expect(onSeek).toHaveBeenCalledWith(5000);
      expect(onMarkerAChange).not.toHaveBeenCalled();
    });

    it('places A at the tapped position when armed for A', () => {
      const onMarkerAChange = jest.fn();
      const onPlaceComplete = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        durationMs: 10000,
        placeMode: 'A',
        onMarkerAChange,
        onPlaceComplete,
        onSeek,
      });
      layout(tree);

      begin(150);
      finalize();

      expect(onMarkerAChange).toHaveBeenCalledWith(5000);
      expect(onSeek).not.toHaveBeenCalled();
      // Completing the placement advances the arm state (A → B).
      expect(onPlaceComplete).toHaveBeenCalledWith('A');
    });

    it('places B at the tapped position when armed for B', () => {
      const onMarkerBChange = jest.fn();
      const onPlaceComplete = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 2000,
        durationMs: 10000,
        placeMode: 'B',
        onMarkerBChange,
        onPlaceComplete,
        onSeek,
      });
      layout(tree);

      // 200px → (200 - 12) / 276 * 10000 ≈ 6812ms, well clear of A.
      begin(200);
      finalize();

      expect(onMarkerBChange).toHaveBeenCalledWith(6812);
      expect(onSeek).not.toHaveBeenCalled();
      expect(onPlaceComplete).toHaveBeenCalledWith('B');
    });

    it('does not fire onPlaceComplete when fine-tuning an existing handle', () => {
      const onMarkerAChange = jest.fn();
      const onPlaceComplete = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        placeMode: 'none',
        onMarkerAChange,
        onPlaceComplete,
        onSeek,
      });
      layout(tree);

      // Grab the existing A handle (x ≈ 150) and release.
      begin(150);
      finalize();

      expect(onMarkerAChange).toHaveBeenCalled();
      expect(onPlaceComplete).not.toHaveBeenCalled();
    });

    it('seeks on a bare tap once both markers exist', () => {
      const onMarkerAChange = jest.fn();
      const onMarkerBChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 2000,
        markerB: 8000,
        durationMs: 10000,
        placeMode: 'none',
        onMarkerAChange,
        onMarkerBChange,
        onSeek,
      });
      layout(tree);

      // 150px is the track midpoint (5000ms) and far from either handle.
      begin(150);

      expect(onSeek).toHaveBeenCalledWith(5000);
      expect(onMarkerAChange).not.toHaveBeenCalled();
      expect(onMarkerBChange).not.toHaveBeenCalled();
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

  describe('snippet preview wiring', () => {
    let nowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      nowSpy = jest.spyOn(Date, 'now');
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('starts the preview and follows the marker while dragging it', () => {
      const onPreviewStart = jest.fn();
      const onPreviewMove = jest.fn();
      const onPreviewEnd = jest.fn();
      const onMarkerAChange = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
        onPreviewStart,
        onPreviewMove,
        onPreviewEnd,
      });
      layout(tree);

      // Grab the A handle (x ≈ 150 → 5000ms): the preview starts there and the
      // follow fires with the same value at the marker-callback cadence.
      nowSpy.mockReturnValue(1000);
      begin(150);
      expect(onPreviewStart).toHaveBeenCalledWith(5000);
      expect(onPreviewMove).toHaveBeenCalledWith(5000);

      // A move past the throttle window follows the marker to its new position.
      nowSpy.mockReturnValue(1100);
      move(180);
      expect(onPreviewMove).toHaveBeenCalledWith(6087);
      expect(onMarkerAChange).toHaveBeenCalledWith(6087);

      // Release stops the preview.
      nowSpy.mockReturnValue(1120);
      finalize();
      expect(onPreviewEnd).toHaveBeenCalledTimes(1);
    });

    it('previews a tap-to-place placement (start then end)', () => {
      const onPreviewStart = jest.fn();
      const onPreviewEnd = jest.fn();
      const onMarkerAChange = jest.fn();
      const tree = renderWaveform({
        durationMs: 10000,
        placeMode: 'A',
        onMarkerAChange,
        onPreviewStart,
        onPreviewEnd,
      });
      layout(tree);

      begin(150);
      finalize();

      expect(onPreviewStart).toHaveBeenCalledWith(5000);
      expect(onPreviewEnd).toHaveBeenCalledTimes(1);
    });

    it('never invokes the preview during a plain seek drag', () => {
      const onPreviewStart = jest.fn();
      const onPreviewMove = jest.fn();
      const onPreviewEnd = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onSeek,
        onPreviewStart,
        onPreviewMove,
        onPreviewEnd,
      });
      layout(tree);

      // x=30 is far from the marker → a seek, not a marker grab.
      nowSpy.mockReturnValue(1000);
      begin(30);
      nowSpy.mockReturnValue(1100);
      move(60);
      finalize();

      expect(onSeek).toHaveBeenCalled();
      expect(onPreviewStart).not.toHaveBeenCalled();
      expect(onPreviewMove).not.toHaveBeenCalled();
      expect(onPreviewEnd).not.toHaveBeenCalled();
    });

    it('drags the marker normally when no preview callbacks are wired', () => {
      const onMarkerAChange = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
      });
      layout(tree);

      begin(150);
      finalize();

      // No preview props → marker still moves, nothing throws.
      expect(onMarkerAChange).toHaveBeenCalledWith(5000);
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

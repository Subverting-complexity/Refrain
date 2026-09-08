import React from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { makeMutable, SharedValue } from 'react-native-reanimated';

import { darkTheme } from '../../theme';
import { MARKER_LINE_HALO } from '../WaveformMarkers';
import { waveformHeightForViewport } from '../waveformLayout';
import { WaveformView } from '../WaveformView';

jest.mock('../../hooks/useTheme');

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

/**
 * The playhead the surface was last rendered with. It takes a shared value
 * rather than a number — the cursor follows it on the UI thread — so the tests
 * hand it one and write to this to move the engine without re-rendering.
 */
let playheadMs: SharedValue<number>;

/**
 * The last surface rendered, so it can be torn down between tests.
 *
 * The UI-thread projections are driven by reactions that live as long as the
 * component does. A tree left mounted keeps running them against the previous
 * test's shared values while the next test is waiting on a frame, which
 * surfaces as an error raised inside whichever test happens to be running.
 */
let currentTree: ReactTestRenderer | null = null;

afterEach(async () => {
  const tree = currentTree;
  currentTree = null;
  if (!tree) return;
  // Let this test's own reactions finish inside `act` before tearing the tree
  // down, so a pending frame cannot land in the middle of the next test.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  act(() => tree.unmount());
});

function renderWaveform({
  positionMs = 0,
  ...props
}: Partial<Omit<React.ComponentProps<typeof WaveformView>, 'playheadMs'>> & {
  positionMs?: number;
} = {}) {
  playheadMs = makeMutable(positionMs);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <WaveformView
        peaks={DEFAULT_PEAKS}
        playheadMs={playheadMs}
        durationMs={10000}
        onSeek={jest.fn()}
        {...props}
      />,
    );
  });
  currentTree = tree;
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

/**
 * Drive one gesture callback and let its `runOnJS` calls land.
 *
 * The handlers are worklets: they move the surface by writing shared values,
 * and reach JavaScript only through `runOnJS`, which queues a microtask. So
 * nothing has been delivered to the callbacks until that queue has drained.
 */
async function fire(run: () => void): Promise<void> {
  await act(async () => {
    run();
  });
}

/**
 * Let the UI-thread projections reach React.
 *
 * The bars' three edges, the announced percentage and the spoken time are all
 * derived in the UI runtime and mirrored back with `runOnJS`, so none of them
 * is on the first render. Under Jest those reactions are driven from the frame
 * loop, which runs on real timers, so draining the microtask queue is not
 * enough — anything asserting one of them has to let a frame pass.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

// Default y of 0 puts the touch in the top half (where A's flag lives); tests
// that exercise the A/B vertical split pass an explicit y.
const begin = (x: number, y = 0) => fire(() => handlers().begin({ x, y }));
const move = (x: number) => fire(() => handlers().update({ x }));
const finalize = () => fire(() => handlers().finalize({}));

describe('WaveformView', () => {
  it('renders bars for each peak', async () => {
    const tree = renderWaveform();
    const bars = findBars(tree);
    expect(bars).toHaveLength(DEFAULT_PEAKS.length);
  });

  /**
   * A bar's fill. Each tier is an opaque token now rather than the accent at
   * a tier-specific alpha, so a bar is classified by which token it matches
   * — except a played one, which is mixed between two of them by its own
   * amplitude and so matches neither exactly.
   */
  function barFill(bar: ReturnType<typeof findBars>[number]): string {
    const styled = bar.props.style.find(
      (s: Record<string, unknown>) => typeof s?.backgroundColor === 'string',
    ) as { backgroundColor: string } | undefined;
    return styled?.backgroundColor ?? '';
  }

  const isDull = (bar: ReturnType<typeof findBars>[number]) =>
    barFill(bar) === darkTheme.colors.waveformDull;
  const isLoop = (bar: ReturnType<typeof findBars>[number]) =>
    barFill(bar) === darkTheme.colors.waveformLoop;
  const isPlayed = (bar: ReturnType<typeof findBars>[number]) =>
    !isDull(bar) && !isLoop(bar) && barFill(bar).startsWith('#');

  it('colors bars based on playback progress', async () => {
    const tree = renderWaveform({ positionMs: 5000 });
    await settle();
    const bars = findBars(tree);

    // progress = 0.5; bar centres are (i+0.5)/5 → 0.1, 0.3, 0.5 played and
    // 0.7, 0.9 unplayed.
    expect(bars.filter(isPlayed)).toHaveLength(3);
    expect(bars.filter(isDull)).toHaveLength(2);
  });

  // The middle tier is the whole point of #268: it is what tells the reader
  // where the loop window is before it has played.
  it('gives the unplayed part of the loop region its own tier', async () => {
    const tree = renderWaveform({
      positionMs: 0,
      markerA: 2000,
      markerB: 8000,
    });
    await settle();
    const bars = findBars(tree);

    // Region 0.2..0.8 of a 10s track covers the bars centred at 0.3, 0.5
    // and 0.7; nothing has played, so all three sit in the loop tier.
    expect(bars.filter(isLoop)).toHaveLength(3);
    expect(bars.filter(isDull)).toHaveLength(2);
  });

  // Grading is what keeps the waveform reading as a waveform rather than a
  // block of colour, so a quiet played bar and a loud one must not match.
  it('grades a played bar by its amplitude', async () => {
    const tree = renderWaveform({ positionMs: 10000, peaks: [0.1, 1] });
    await settle();
    const [quiet, loud] = findBars(tree);

    expect(barFill(quiet)).not.toBe(barFill(loud));
    expect(barFill(loud)).toBe(darkTheme.colors.waveformPeak);
  });

  // Both ends of the range have to be pinned, not just the loud one. With only
  // the top pinned, grading from the *dull* tier instead of the played one
  // passes every other test here while collapsing a quiet played bar to 1.12
  // against the bars around it, which is the bug #268 was filed for.
  it('starts the played range at the played tier, not below it', async () => {
    const tree = renderWaveform({ positionMs: 10000, peaks: [0, 1] });
    await settle();
    const [silent] = findBars(tree);

    expect(barFill(silent)).toBe(darkTheme.colors.waveformPlayed);
  });

  // `Math.max` passes NaN through, so an unguarded height reaches the style as
  // the string "NaN%". A 32-bit float WAV can carry a NaN sample, and
  // `normalizePeaks` does not filter individual samples.
  it('keeps a bar height numeric when its peak is not', async () => {
    const tree = renderWaveform({ positionMs: 0, peaks: [NaN, 0.5] });
    const [bad] = findBars(tree);
    const height = (
      bad.props.style.find(
        (entry: Record<string, unknown>) => entry?.height !== undefined,
      ) as { height: string }
    ).height;

    expect(height).not.toContain('NaN');
  });

  /**
   * The mechanism #323's fourth criterion turns on: the surface reads the
   * viewport itself, so an Android inset or soft-keyboard metric change stops
   * at this component instead of re-rendering the player screen. Without a
   * test here, putting a static default back would fail nothing.
   */
  it('sizes itself to the viewport when the caller gives no height', async () => {
    const spy = jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 400, height: 1000, scale: 2, fontScale: 1 });
    try {
      const tree = renderWaveform();
      const height = StyleSheet.flatten(getTouchArea(tree).props.style).height;

      expect(height).toBe(waveformHeightForViewport(1000));
      expect(height).not.toBe(180);
    } finally {
      spy.mockRestore();
    }
  });

  it('uses the height it is given over the viewport', async () => {
    const tree = renderWaveform({ height: 210 });

    expect(StyleSheet.flatten(getTouchArea(tree).props.style).height).toBe(210);
  });

  /**
   * The playhead is translated along the track from a shared value rather than
   * placed with a percentage `left`, so where it sits cannot be read from the
   * rendered tree — an animated style resolves to an empty object under Jest.
   * The arithmetic behind the translation is covered in
   * `waveformLayout.test.ts`; what is checked here is that the element exists
   * and is anchored at the track's left edge for the translation to work from.
   */
  it('renders a cursor element anchored for translation', async () => {
    const tree = renderWaveform({ positionMs: 2500 });

    const cursors = tree.root.findAll((node) => {
      if (node.type !== 'View' || !Array.isArray(node.props.style))
        return false;
      const flat = StyleSheet.flatten(node.props.style);
      return flat.backgroundColor === '#e8f5f0' && flat.left === 0;
    });

    expect(cursors).toHaveLength(1);
  });

  // A marker's line, found by its own colour so the playhead — which shares
  // the line's width — cannot be mistaken for one.
  function markerStyles(tree: ReactTestRenderer) {
    const line = (color: string) =>
      tree.root.find(
        (node) =>
          node.type === 'View' &&
          Array.isArray(node.props.style) &&
          node.props.style.some(
            (s: Record<string, unknown>) =>
              s && s.width === 2 + MARKER_LINE_HALO * 2,
          ) &&
          node.props.style.some(
            (s: Record<string, unknown>) => s && s.backgroundColor === color,
          ),
      ).props.style;
    return { a: line('#ffb02e'), b: line('#ff5d77') };
  }

  describe('render churn', () => {
    /**
     * Everything on the surface that is not the playhead has to survive a
     * playback tick. Reference equality is what can see it: a memoised child
     * that bailed out keeps the identical props object, not an equal one.
     */
    it('leaves the markers alone when only the playhead moves', async () => {
      const tree = renderWaveform({
        positionMs: 0,
        markerA: 2000,
        markerB: 8000,
      });
      await settle();
      const before = markerStyles(tree);

      // A playback tick moves the shared value; nothing is re-rendered for it.
      playheadMs.value = 100;
      await settle();

      const after = markerStyles(tree);
      expect(after.a).toBe(before.a);
      expect(after.b).toBe(before.b);
    });

    // The bars have the same obligation as the markers: a tick moves the fill
    // edge past one or two of them, and the rest must not be rebuilt.
    // `useWaveformGesture`'s own tests cover the drag side of this.
    it('leaves the bars beyond the fill edge alone when the playhead moves', async () => {
      const tree = renderWaveform({ positionMs: 2000 });
      await settle();
      const before = findBars(tree).map((bar) => bar.props.style);

      playheadMs.value = 2100;
      await settle();

      const after = findBars(tree).map((bar) => bar.props.style);
      expect(after[3]).toBe(before[3]);
      expect(after[4]).toBe(before[4]);
    });
  });

  it('renders nothing when peaks is empty', async () => {
    const tree = renderWaveform({ peaks: [] });
    const bars = findBars(tree);
    expect(bars).toHaveLength(0);
  });

  it('sets accessibility role and label', async () => {
    const tree = renderWaveform({ positionMs: 5000, durationMs: 120000 });
    await settle();

    const container = tree.root.findAll(
      (node) =>
        node.type === 'View' && node.props.accessibilityRole === 'adjustable',
    );

    expect(container).toHaveLength(1);
    expect(container[0].props.accessibilityLabel).toContain('0:05');
    expect(container[0].props.accessibilityLabel).toContain('2:00');
  });

  it('includes loop range in accessibility label when markers set', async () => {
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

  it('calls onSeek when touch area is tapped', async () => {
    const onSeek = jest.fn();
    const tree = renderWaveform({ onSeek });
    layout(tree);

    await begin(150);

    expect(onSeek).toHaveBeenCalledWith(5000);
  });

  it('maps a tap at the bars left edge to position 0 (padding-aware)', async () => {
    const onSeek = jest.fn();
    const tree = renderWaveform({ onSeek, durationMs: 10000 });
    layout(tree);

    // The bars start HORIZONTAL_PADDING (spacing.md = 12) in from the edge,
    // so a tap there is the start of the track, not a positive offset.
    await begin(12);

    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it('maps a tap at the bars right edge to the full duration', async () => {
    const onSeek = jest.fn();
    const tree = renderWaveform({ onSeek, durationMs: 10000 });
    layout(tree);

    // Right edge of the bars sits at width - HORIZONTAL_PADDING = 288.
    await begin(288);

    expect(onSeek).toHaveBeenCalledWith(10000);
  });

  it('renders A/B marker lines in their marker colors, edged in the card colour', async () => {
    const tree = renderWaveform({ markerA: 2000, markerB: 8000 });

    const markerLine = (color: string) =>
      tree.root.findAll(
        (node) =>
          node.type === 'View' &&
          node.props.style &&
          Array.isArray(node.props.style) &&
          node.props.style.some(
            (s: Record<string, unknown>) =>
              s && s.width === 2 + MARKER_LINE_HALO * 2,
          ) &&
          node.props.style.some(
            (s: Record<string, unknown>) => s && s.backgroundColor === color,
          ),
      );

    expect(markerLine('#ffb02e')).toHaveLength(1);
    expect(markerLine('#ff5d77')).toHaveLength(1);

    // The edge is what keeps the line visible where its own colour cannot,
    // so its absence is a real regression rather than a styling detail.
    for (const color of ['#ffb02e', '#ff5d77']) {
      const flat = StyleSheet.flatten(markerLine(color)[0].props.style);
      expect(flat.borderColor).toBe(darkTheme.colors.surface);
      expect(flat.borderLeftWidth).toBe(MARKER_LINE_HALO);
      expect(flat.borderRightWidth).toBe(MARKER_LINE_HALO);
    }
  });

  it('renders labelled grab handles for the markers', async () => {
    const tree = renderWaveform({ markerA: 2000, markerB: 8000 });

    const handleLabels = tree.root
      .findAll((node) => node.type === 'Text')
      .map((n) => n.props.children)
      .filter((c) => c === 'A' || c === 'B');

    expect(handleLabels).toEqual(expect.arrayContaining(['A', 'B']));
  });

  /**
   * The loop wash is a one-pixel band scaled to the region's width, not a band
   * whose width is set: a scale is resolved when the frame is drawn, where a
   * width would re-run layout on every pointer event of a marker drag.
   */
  it('renders the loop region as a band it can scale', async () => {
    const isRegion = (node: {
      type: unknown;
      props: Record<string, unknown>;
    }) =>
      node.type === 'View' &&
      Array.isArray(node.props.style) &&
      (node.props.style as Record<string, unknown>[]).some(
        (s) => s && s.width === 1 && s.transformOrigin === 'left center',
      );

    const tree = renderWaveform({ markerA: 2000, markerB: 8000 });
    expect(tree.root.findAll(isRegion)).toHaveLength(1);

    // Absent when there is no region to wash.
    const none = renderWaveform({ markerA: 2000 });
    expect(none.root.findAll(isRegion)).toHaveLength(0);
  });

  it('adds accessibility labels to marker lines', async () => {
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
    it('calls onMarkerAChange when touch starts near markerA', async () => {
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
        onSeek,
      });
      layout(tree);

      await begin(152);

      expect(onMarkerAChange).toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('calls onMarkerBChange when touch starts near markerB', async () => {
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

      await begin(242);

      expect(onMarkerBChange).toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('reports where a dragged marker was released, not each move', async () => {
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
      await begin(150);
      onMarkerAChange.mockClear();

      // Well past the throttle window: a seek would have committed here, and
      // a marker deliberately does not — writing one republishes the transport
      // and re-renders the screen, so the drag is read from the shared values
      // instead until it settles.
      nowSpy.mockReturnValue(1100);
      await move(180);
      expect(onMarkerAChange).not.toHaveBeenCalled();

      // Bars are inset by HORIZONTAL_PADDING (spacing.md = 12) on each side,
      // so the track spans 276px: (180 - 12) / 276 * 10000 = 6087ms.
      nowSpy.mockReturnValue(1120);
      await finalize();
      expect(onMarkerAChange).toHaveBeenCalledTimes(1);
      expect(onMarkerAChange).toHaveBeenCalledWith(6087);
      expect(onSeek).not.toHaveBeenCalled();
      nowSpy.mockRestore();
    });

    it('clamps the B handle so it cannot be dragged before marker A', async () => {
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
      await begin(233);
      onMarkerBChange.mockClear();

      // Drag well before A; the value must clamp to just past A (2001ms),
      // never to or below A.
      nowSpy.mockReturnValue(1100);
      await move(30);
      nowSpy.mockReturnValue(1120);
      await finalize();

      expect(onMarkerBChange).toHaveBeenCalledWith(2001);
      onMarkerBChange.mock.calls.forEach(([ms]) => {
        expect(ms).toBeGreaterThan(2000);
      });
      nowSpy.mockRestore();
    });

    it('clamps the A handle so it cannot be dragged past marker B', async () => {
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
      await begin(67);
      onMarkerAChange.mockClear();

      // Drag well past B; the value must clamp to just before B (7999ms),
      // never to or beyond B.
      nowSpy.mockReturnValue(1100);
      await move(270);
      nowSpy.mockReturnValue(1120);
      await finalize();

      expect(onMarkerAChange).toHaveBeenCalledWith(7999);
      onMarkerAChange.mock.calls.forEach(([ms]) => {
        expect(ms).toBeLessThan(8000);
      });
      nowSpy.mockRestore();
    });

    it('disambiguates overlapping markers by vertical half (top → A)', async () => {
      const onMarkerAChange = jest.fn();
      const onMarkerBChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 4500,
        markerB: 5500,
        durationMs: 10000,
        // The y values below split a 180-tall surface. Pinned, because the
        // surface otherwise scales itself to the viewport.
        height: 180,
        onMarkerAChange,
        onMarkerBChange,
        onSeek,
      });
      layout(tree);

      // Both handles are within the horizontal hit zone of x=150; a touch in
      // the top half (y=10) grabs A (its flag sits at the top).
      await begin(150, 10);

      expect(onMarkerAChange).toHaveBeenCalled();
      expect(onMarkerBChange).not.toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('disambiguates overlapping markers by vertical half (bottom → B)', async () => {
      const onMarkerAChange = jest.fn();
      const onMarkerBChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 4500,
        markerB: 5500,
        durationMs: 10000,
        // The y values below split a 180-tall surface. Pinned, because the
        // surface otherwise scales itself to the viewport.
        height: 180,
        onMarkerAChange,
        onMarkerBChange,
        onSeek,
      });
      layout(tree);

      // A touch in the bottom half (y=120) grabs B (its flag sits at the
      // bottom), even though both handles overlap horizontally.
      await begin(150, 120);

      expect(onMarkerBChange).toHaveBeenCalled();
      expect(onMarkerAChange).not.toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('falls back to seek when touch is not near any marker', async () => {
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
        onSeek,
      });
      layout(tree);

      await begin(30);

      expect(onSeek).toHaveBeenCalled();
      expect(onMarkerAChange).not.toHaveBeenCalled();
    });

    it('does not drag markers when callbacks are not provided', async () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onSeek,
      });
      layout(tree);

      await begin(150);

      expect(onSeek).toHaveBeenCalled();
    });

    it('only seeks on an unarmed tap, even with no markers', async () => {
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        durationMs: 10000,
        placeMode: 'none',
        onMarkerAChange,
        onSeek,
      });
      layout(tree);

      await begin(150);

      expect(onSeek).toHaveBeenCalledWith(5000);
      expect(onMarkerAChange).not.toHaveBeenCalled();
    });

    it('places A at the tapped position when armed for A', async () => {
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

      await begin(150);
      await finalize();

      expect(onMarkerAChange).toHaveBeenCalledWith(5000);
      expect(onSeek).not.toHaveBeenCalled();
      // Completing the placement advances the arm state (A → B).
      expect(onPlaceComplete).toHaveBeenCalledWith('A');
    });

    it('places B at the tapped position when armed for B', async () => {
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
      await begin(200);
      await finalize();

      expect(onMarkerBChange).toHaveBeenCalledWith(6812);
      expect(onSeek).not.toHaveBeenCalled();
      expect(onPlaceComplete).toHaveBeenCalledWith('B');
    });

    it('does not fire onPlaceComplete when fine-tuning an existing handle', async () => {
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
      await begin(150);
      await finalize();

      expect(onMarkerAChange).toHaveBeenCalled();
      expect(onPlaceComplete).not.toHaveBeenCalled();
    });

    it('fires onMarkerCommit on release of a tap-to-place', async () => {
      const onMarkerCommit = jest.fn();
      const tree = renderWaveform({
        durationMs: 10000,
        placeMode: 'A',
        onMarkerAChange: jest.fn(),
        onMarkerCommit,
      });
      layout(tree);

      await begin(150);
      expect(onMarkerCommit).not.toHaveBeenCalled();
      await finalize();

      expect(onMarkerCommit).toHaveBeenCalledWith('A');
    });

    it('fires onMarkerCommit when fine-tuning an existing handle', async () => {
      const onMarkerCommit = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        placeMode: 'none',
        onMarkerAChange: jest.fn(),
        onMarkerCommit,
      });
      layout(tree);

      // A nudge re-parks the playhead even though it never re-arms placement.
      await begin(150);
      await move(160);
      await finalize();

      expect(onMarkerCommit).toHaveBeenCalledWith('A');
    });

    it('does not fire onMarkerCommit for a plain seek', async () => {
      const onMarkerCommit = jest.fn();
      const tree = renderWaveform({
        durationMs: 10000,
        placeMode: 'none',
        onSeek: jest.fn(),
        onMarkerCommit,
      });
      layout(tree);

      await begin(150);
      await finalize();

      expect(onMarkerCommit).not.toHaveBeenCalled();
    });

    it('commits before tearing the snippet preview down', async () => {
      // The engine redirects the preview's pending restore, so the commit must
      // land while the monitor is still up — otherwise the restore's seek
      // races it and can win.
      const order: string[] = [];
      const tree = renderWaveform({
        durationMs: 10000,
        placeMode: 'A',
        onMarkerAChange: jest.fn(),
        onMarkerCommit: () => order.push('commit'),
        onPreviewStart: jest.fn(),
        onPreviewEnd: () => order.push('previewEnd'),
      });
      layout(tree);

      await begin(150);
      await finalize();

      expect(order).toEqual(['commit', 'previewEnd']);
    });

    it('seeks on a bare tap once both markers exist', async () => {
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
      await begin(150);

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

    it('throttles native seeks during rapid drag moves', async () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(12);
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenLastCalledWith(0);

      // Two moves within the throttle window: no extra native seeks.
      nowSpy.mockReturnValue(1010);
      await move(60);
      nowSpy.mockReturnValue(1020);
      await move(90);
      expect(onSeek).toHaveBeenCalledTimes(1);

      // A move past the throttle window fires one native seek.
      nowSpy.mockReturnValue(1100);
      await move(150);
      expect(onSeek).toHaveBeenCalledTimes(2);
    });

    /**
     * The point of the whole rewrite. The playhead follows the finger from a
     * shared value through an animated style, so a pointer event moves it
     * without rendering anything — and on Android there are up to a hundred and
     * twenty of those a second.
     *
     * Element identity is what can see it: a re-render would build fresh child
     * elements even where every value it computed was equal.
     */
    it('does not re-render the surface while the finger moves', async () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        positionMs: 0,
        durationMs: 10000,
        onSeek,
      });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(12);
      const afterBegin = getAdjustable(tree).props;

      nowSpy.mockReturnValue(1010);
      await move(60);
      nowSpy.mockReturnValue(1020);
      await move(150);
      nowSpy.mockReturnValue(1030);
      await move(200);

      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(getAdjustable(tree).props).toBe(afterBegin);
      await finalize();
    });

    it('fires one final unthrottled seek on release', async () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(12);
      // Throttled move — final position must still commit on release.
      nowSpy.mockReturnValue(1010);
      await move(150);
      expect(onSeek).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1020);
      await finalize();
      expect(onSeek).toHaveBeenCalledTimes(2);
    });

    it('does not fire a redundant seek on release after a pure tap', async () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({ durationMs: 10000, onSeek });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(150);
      await finalize();

      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenCalledWith(5000);
    });

    it('throttles marker updates and commits the final one on release', async () => {
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
      await begin(150);
      expect(onMarkerAChange).toHaveBeenCalledTimes(1);

      // Throttled move within the window — no extra native call yet.
      nowSpy.mockReturnValue(1010);
      await move(180);
      expect(onMarkerAChange).toHaveBeenCalledTimes(1);

      // Release commits the final marker position.
      nowSpy.mockReturnValue(1020);
      await finalize();
      expect(onMarkerAChange).toHaveBeenCalledTimes(2);
      expect(onMarkerAChange).toHaveBeenLastCalledWith(6087);
      expect(onSeek).not.toHaveBeenCalled();
    });

    /**
     * What the platform is told, as distinct from what is drawn. The announced
     * percentage follows the engine, not the finger: a screen reader drives
     * this surface with the increment and decrement actions rather than by
     * dragging, and re-announcing a value a hundred times a second would both
     * flood the reader and re-render the surface for every pointer event.
     */
    it('announces the engine position rather than the finger', async () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        positionMs: 0,
        durationMs: 10000,
        onSeek,
      });
      layout(tree);

      nowSpy.mockReturnValue(1000);
      await begin(288);
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(0);

      await finalize();
      expect(getAdjustable(tree).props.accessibilityValue.now).toBe(0);
    });
  });

  describe('accessibility actions', () => {
    it('exposes increment and decrement actions when no marker callbacks are provided', async () => {
      const tree = renderWaveform();
      const container = getAdjustable(tree);
      expect(container.props.accessibilityActions).toEqual([
        { name: 'increment' },
        { name: 'decrement' },
      ]);
    });

    it('adds placeA action when onMarkerAChange is provided', async () => {
      const tree = renderWaveform({ onMarkerAChange: jest.fn() });
      const actions = getAdjustable(tree).props.accessibilityActions;
      expect(actions).toContainEqual({
        name: 'placeA',
        label: 'Place A marker at current position',
      });
    });

    it('adds placeB action when onMarkerBChange is provided', async () => {
      const tree = renderWaveform({ onMarkerBChange: jest.fn() });
      const actions = getAdjustable(tree).props.accessibilityActions;
      expect(actions).toContainEqual({
        name: 'placeB',
        label: 'Place B marker at current position',
      });
    });

    it('places A at current position on placeA action', async () => {
      const onMarkerAChange = jest.fn();
      const announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => undefined);
      const tree = renderWaveform({
        positionMs: 5000,
        durationMs: 20000,
        onMarkerAChange,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'placeA' },
        });
      });
      expect(onMarkerAChange).toHaveBeenCalledWith(5000);
      expect(announceSpy).toHaveBeenCalledWith(
        expect.stringContaining('A marker placed'),
      );
      announceSpy.mockRestore();
    });

    it('places B at current position on placeB action', async () => {
      const onMarkerBChange = jest.fn();
      const announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => undefined);
      const tree = renderWaveform({
        positionMs: 8000,
        durationMs: 20000,
        onMarkerBChange,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'placeB' },
        });
      });
      expect(onMarkerBChange).toHaveBeenCalledWith(8000);
      expect(announceSpy).toHaveBeenCalledWith(
        expect.stringContaining('B marker placed'),
      );
      announceSpy.mockRestore();
    });

    it('commits the placement made by the placeA action', async () => {
      const onMarkerCommit = jest.fn();
      const announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => undefined);
      const tree = renderWaveform({
        positionMs: 5000,
        durationMs: 20000,
        onMarkerAChange: jest.fn(),
        onMarkerCommit,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'placeA' },
        });
      });
      expect(onMarkerCommit).toHaveBeenCalledWith('A');
      announceSpy.mockRestore();
    });

    it('commits a placeB action that lands after A', async () => {
      const onMarkerCommit = jest.fn();
      const announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => undefined);
      const tree = renderWaveform({
        positionMs: 8000,
        durationMs: 20000,
        markerA: 5000,
        onMarkerBChange: jest.fn(),
        onMarkerCommit,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'placeB' },
        });
      });
      expect(onMarkerCommit).toHaveBeenCalledWith('B');
      announceSpy.mockRestore();
    });

    it('does not commit a placeB action the engine will reject', async () => {
      // This path isn't clamped past A like a drag is, so B at or before A is
      // refused — and a refused placement must not move the playhead.
      const onMarkerBChange = jest.fn();
      const onMarkerCommit = jest.fn();
      const announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => undefined);
      const tree = renderWaveform({
        positionMs: 2000,
        durationMs: 20000,
        markerA: 5000,
        onMarkerBChange,
        onMarkerCommit,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'placeB' },
        });
      });
      expect(onMarkerBChange).toHaveBeenCalledWith(2000);
      expect(onMarkerCommit).not.toHaveBeenCalled();
      announceSpy.mockRestore();
    });

    it('does not call onMarkerAChange for placeA when callback is absent', async () => {
      const onSeek = jest.fn();
      const tree = renderWaveform({
        positionMs: 5000,
        durationMs: 20000,
        onSeek,
      });
      act(() => {
        getAdjustable(tree).props.onAccessibilityAction({
          nativeEvent: { actionName: 'placeA' },
        });
      });
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('exposes an accessibilityHint describing available actions', async () => {
      const tree = renderWaveform();
      const hint = getAdjustable(tree).props.accessibilityHint;
      expect(hint).toContain('loop markers');
    });

    it('announces progress as a percentage via accessibilityValue', async () => {
      const tree = renderWaveform({ positionMs: 5000, durationMs: 20000 });
      await settle();
      const container = getAdjustable(tree);
      expect(container.props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 25,
      });
    });

    it('seeks forward 5s on increment', async () => {
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

    it('seeks back 5s on decrement', async () => {
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

    it('clamps increment to duration', async () => {
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

    it('clamps decrement to zero', async () => {
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

    it('ignores actions when duration is zero', async () => {
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

    it('starts the preview and follows the marker while dragging it', async () => {
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
      await begin(150);
      expect(onPreviewStart).toHaveBeenCalledWith(5000);
      expect(onPreviewMove).toHaveBeenCalledWith(5000);

      // A move past the throttle window follows the marker to its new position.
      nowSpy.mockReturnValue(1100);
      await move(180);
      expect(onPreviewMove).toHaveBeenCalledWith(6087);

      // Release stops the preview, and delivers the marker.
      nowSpy.mockReturnValue(1120);
      await finalize();
      expect(onMarkerAChange).toHaveBeenCalledWith(6087);
      expect(onPreviewEnd).toHaveBeenCalledTimes(1);
    });

    it('previews a tap-to-place placement (start then end)', async () => {
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

      await begin(150);
      await finalize();

      expect(onPreviewStart).toHaveBeenCalledWith(5000);
      expect(onPreviewEnd).toHaveBeenCalledTimes(1);
    });

    it('never invokes the preview during a plain seek drag', async () => {
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
      await begin(30);
      nowSpy.mockReturnValue(1100);
      await move(60);
      await finalize();

      expect(onSeek).toHaveBeenCalled();
      expect(onPreviewStart).not.toHaveBeenCalled();
      expect(onPreviewMove).not.toHaveBeenCalled();
      expect(onPreviewEnd).not.toHaveBeenCalled();
    });

    it('drags the marker normally when no preview callbacks are wired', async () => {
      const onMarkerAChange = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
      });
      layout(tree);

      await begin(150);
      await finalize();

      // No preview props → marker still moves, nothing throws.
      expect(onMarkerAChange).toHaveBeenCalledWith(5000);
    });
  });

  /**
   * The surface follows the playhead and the markers exactly — the cursor and
   * the marker lines have to, or they would read as stuttering — but the bars
   * cannot change until an edge crosses one of their centres. These are the
   * tests for that difference, and for the jank it was causing: before it, a
   * playback tick and every pointer event of a drag rebuilt and re-reconciled
   * all two hundred bars of a real track.
   *
   * Reference equality is the assertion that can see it: React reuses the
   * previous element for a memoised child that bailed out.
   */
  describe('what a movement re-renders', () => {
    it('leaves every bar alone when the playhead moves within one bar', async () => {
      // Five bars over ten seconds: centres at 1s, 3s, 5s, 7s and 9s. Both
      // positions sit between the second and third, so no bar can change.
      const tree = renderWaveform({ positionMs: 3400, durationMs: 10000 });
      await settle();
      const before = findBars(tree).map((bar) => bar.props.style);

      playheadMs.value = 3600;
      await settle();

      expect(findBars(tree).map((bar) => bar.props.style)).toEqual(before);
      findBars(tree).forEach((bar, index) => {
        expect(bar.props.style).toBe(before[index]);
      });
    });

    it('still recolours the bar the playhead crosses', async () => {
      const tree = renderWaveform({ positionMs: 2900, durationMs: 10000 });
      await settle();
      const before = findBars(tree).map((bar) => bar.props.style);

      // The playhead moves by writing the shared value, exactly as the engine
      // moves it — no prop, and so no render until the crossing forces one.
      playheadMs.value = 3100;
      await settle();

      const after = findBars(tree).map((bar) => bar.props.style);
      expect(after[1]).not.toBe(before[1]);
      expect(after[2]).toBe(before[2]);
    });

    it('leaves the bars alone while a marker is dragged within one bar', async () => {
      const onMarkerAChange = jest.fn();
      const tree = renderWaveform({
        markerA: 4500,
        markerB: 9000,
        durationMs: 10000,
        onMarkerAChange,
        onMarkerBChange: jest.fn(),
      });
      layout(tree);

      // Grab A and nudge it a pixel. A sits at 4500ms, between the bars
      // centred at 3000 and 5000, so the nudge moves it in milliseconds
      // without reaching either centre.
      await begin(137);
      await settle();
      const before = findBars(tree).map((bar) => bar.props.style);
      await move(138);
      await settle();

      findBars(tree).forEach((bar, index) => {
        expect(bar.props.style).toBe(before[index]);
      });
      // The drag is live all the same: the marker lands where it was dropped.
      await finalize();
      expect(onMarkerAChange).toHaveBeenLastCalledWith(4565);
    });
  });

  it('accepts style prop override', async () => {
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

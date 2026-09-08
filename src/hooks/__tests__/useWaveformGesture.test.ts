import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';

import {
  MarkerDrag,
  NO_MARKER,
  TARGET_MARKER_A,
  TARGET_MARKER_B,
  TARGET_NONE,
  TARGET_SEEK,
  useWaveformGesture,
  UseWaveformGestureParams,
  UseWaveformGesture,
} from '../useWaveformGesture';

// Stub gesture-handler with a fluent recorder so the test can invoke the
// begin/update/finalize callbacks directly with synthetic events — the same
// surface the native handler drives on a device.
const mockHandlers: Record<string, (e: unknown) => void> = {};
jest.mock('react-native-gesture-handler', () => {
  const makePan = () => {
    const api: Record<string, unknown> = {};
    ['runOnJS', 'minDistance', 'enabled'].forEach((m) => {
      api[m] = () => api;
    });
    api.onBegin = (f: (e: unknown) => void) => {
      mockHandlers.begin = f;
      return api;
    };
    api.onUpdate = (f: (e: unknown) => void) => {
      mockHandlers.update = f;
      return api;
    };
    api.onFinalize = (f: (e: unknown) => void) => {
      mockHandlers.finalize = f;
      return api;
    };
    return api;
  };
  return { Gesture: { Pan: makePan } };
});

// Geometry the assertions rely on: the track is inset 12px each side, so a
// 300px container gives a 276px track. At a 10s duration, x=12 is 0ms,
// x=150 is 5000ms, and x=288 is 10000ms.
const CONTAINER_WIDTH = 300;
const DURATION_MS = 10000;
const HEIGHT = 180;
/** x of a marker handle at `ms`, in touch-area coordinates. */
const xFor = (ms: number) => 12 + (ms / DURATION_MS) * 276;

let lastResult: UseWaveformGesture;

let renders = 0;

function TestComponent(props: UseWaveformGestureParams) {
  renders += 1;
  lastResult = useWaveformGesture(props);
  return null;
}

function render(overrides: Partial<UseWaveformGestureParams> = {}) {
  const props: UseWaveformGestureParams = {
    durationMs: DURATION_MS,
    height: HEIGHT,
    placeMode: 'none',
    onSeek: jest.fn(),
    ...overrides,
  };
  renders = 0;
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(createElement(TestComponent, props));
  });
  const rerender = () =>
    act(() => {
      tree.update(createElement(TestComponent, props));
    });
  return { props, rerender, renderCount: () => renders };
}

function layout(width = CONTAINER_WIDTH) {
  act(() => {
    lastResult.onLayout({
      nativeEvent: { layout: { width } },
      // The hook only reads layout.width; the rest of the event is irrelevant.
    } as Parameters<UseWaveformGesture['onLayout']>[0]);
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

const begin = (x: number, y = 0) => fire(() => mockHandlers.begin({ x, y }));
const move = (x: number) => fire(() => mockHandlers.update({ x }));
const finalize = () => fire(() => mockHandlers.finalize({}));

describe('useWaveformGesture', () => {
  it('builds the Pan gesture once across re-renders', async () => {
    const { rerender } = render();
    const first = lastResult.gesture;

    rerender();

    expect(lastResult.gesture).toBe(first);
  });

  describe('routing a touch', () => {
    it('seeks on a tap when no marker is under the finger', async () => {
      const { props } = render();
      layout();

      await begin(xFor(5000));

      expect(props.onSeek).toHaveBeenCalledWith(5000);
    });

    it('ignores touches before the surface has been measured', async () => {
      const { props } = render();

      await begin(xFor(5000));

      expect(props.onSeek).not.toHaveBeenCalled();
    });

    it('ignores touches on a track of unknown length', async () => {
      const { props } = render({ durationMs: 0 });
      layout();

      await begin(150);

      expect(props.onSeek).not.toHaveBeenCalled();
    });

    it('grabs an existing A handle instead of seeking', async () => {
      const onMarkerAChange = jest.fn();
      const { props } = render({ markerA: 5000, onMarkerAChange });
      layout();

      await begin(xFor(5000));

      expect(onMarkerAChange).toHaveBeenCalledWith(5000);
      expect(props.onSeek).not.toHaveBeenCalled();
    });

    it('leaves a marker ungrabbable without a change handler', async () => {
      const { props } = render({ markerA: 5000 });
      layout();

      await begin(xFor(5000));

      expect(props.onSeek).toHaveBeenCalledWith(5000);
    });

    // A lives at the top of the surface and B at the bottom, so markers sitting
    // almost on top of each other stay individually selectable.
    it('splits overlapping handles by the vertical half of the touch', async () => {
      const onMarkerAChange = jest.fn();
      const onMarkerBChange = jest.fn();
      render({
        markerA: 5000,
        markerB: 5100,
        onMarkerAChange,
        onMarkerBChange,
      });
      layout();

      await begin(xFor(5000), 10);
      await finalize();
      expect(onMarkerAChange).toHaveBeenCalled();
      expect(onMarkerBChange).not.toHaveBeenCalled();

      await begin(xFor(5000), HEIGHT - 10);
      expect(onMarkerBChange).toHaveBeenCalled();
    });
  });

  describe('tap-to-place', () => {
    it('drops an armed A marker and reports the placement', async () => {
      const onMarkerAChange = jest.fn();
      const onPlaceComplete = jest.fn();
      render({ placeMode: 'A', onMarkerAChange, onPlaceComplete });
      layout();

      await begin(xFor(5000));
      expect(onMarkerAChange).toHaveBeenCalledWith(5000);

      await finalize();
      expect(onPlaceComplete).toHaveBeenCalledWith('A');
    });

    it('does not report a placement for a fine-tune drag', async () => {
      const onMarkerAChange = jest.fn();
      const onPlaceComplete = jest.fn();
      render({ markerA: 5000, onMarkerAChange, onPlaceComplete });
      layout();

      await begin(xFor(5000));
      await finalize();

      expect(onPlaceComplete).not.toHaveBeenCalled();
    });

    it('only seeks when nothing is armed', async () => {
      const onMarkerAChange = jest.fn();
      const { props } = render({ onMarkerAChange });
      layout();

      await begin(xFor(5000));

      expect(props.onSeek).toHaveBeenCalledWith(5000);
      expect(onMarkerAChange).not.toHaveBeenCalled();
    });
  });

  // The engine rejects a B at or before A, so the handle has to stop at the
  // boundary rather than keep moving and have its write silently dropped.
  it('clamps a dragged B handle to just past A', async () => {
    const onMarkerBChange = jest.fn();
    render({ markerA: 5000, markerB: 8000, onMarkerBChange });
    layout();

    await begin(xFor(8000), HEIGHT - 10);
    await move(xFor(1000));
    await finalize();

    expect(onMarkerBChange).toHaveBeenLastCalledWith(5001);
    expect(lastResult.dragMs.value).toBe(5001);
    expect(lastResult.dragTarget.value).toBe(TARGET_NONE);
  });

  describe('drag state', () => {
    it('tracks the live value and target, then clears on release', async () => {
      render();
      layout();

      await begin(xFor(2500));
      expect(lastResult.dragTarget.value).toBe(TARGET_SEEK);
      expect(lastResult.dragMs.value).toBe(2500);

      await move(xFor(6000));
      expect(lastResult.dragMs.value).toBe(6000);

      await finalize();
      expect(lastResult.dragTarget.value).toBe(TARGET_NONE);
    });

    /**
     * The whole point of moving the drag onto the UI thread. Every pointer
     * event moves the surface, and on Android there are up to a hundred and
     * twenty of them a second, but none of them renders: the overlays read
     * `dragMs` through animated styles instead of through props.
     */
    it('follows the finger without rendering the caller', async () => {
      const { renderCount } = render();
      layout();

      await begin(xFor(2500));
      const before = renderCount();

      await move(xFor(3000));
      await move(xFor(3500));
      await move(xFor(4000));
      await move(xFor(4500));

      expect(lastResult.dragMs.value).toBe(4500);
      expect(renderCount()).toBe(before);
      await finalize();
    });

    it('reports the marker positions the overlays draw from', async () => {
      render({ markerA: 5000, onMarkerAChange: jest.fn() });
      layout();

      expect(lastResult.markerAValue.value).toBe(5000);
      expect(lastResult.markerBValue.value).toBe(NO_MARKER);

      await begin(xFor(5000));
      expect(lastResult.dragTarget.value).toBe(TARGET_MARKER_A);
      await finalize();
    });

    it('measures the track inside the surface padding', () => {
      render();
      layout();

      // 300px container, 12px of padding each side.
      expect(lastResult.trackWidth.value).toBe(276);
    });
  });

  describe('publishing to a shared drag', () => {
    /** A drag owned by someone else, the way the player screen supplies one. */
    const makeDrag = (): MarkerDrag => ({
      target: makeMutable(TARGET_NONE),
      ms: makeMutable(0),
    });

    it('writes the supplied drag rather than its own', async () => {
      const drag = makeDrag();
      render({ drag, markerA: 5000, onMarkerAChange: jest.fn() });
      layout();

      await begin(xFor(5000));
      expect(drag.target.value).toBe(TARGET_MARKER_A);

      await move(xFor(6000));
      expect(drag.ms.value).toBe(6000);

      // The hook hands back what it was given, so a caller that only reads the
      // return value sees the same two values as one that supplied them.
      expect(lastResult.drag).toBe(drag);
      expect(lastResult.dragMs.value).toBe(6000);

      await finalize();
      expect(drag.target.value).toBe(TARGET_NONE);
    });

    it('publishes a B drag under its own target', async () => {
      const drag = makeDrag();
      render({
        drag,
        markerA: 2000,
        markerB: 8000,
        onMarkerBChange: jest.fn(),
      });
      layout();

      await begin(xFor(8000), HEIGHT - 10);

      expect(drag.target.value).toBe(TARGET_MARKER_B);
      await finalize();
    });

    /**
     * The reason the drag is shared at all. A marker written to the engine on
     * every pointer event republished the transport twenty times a second, and
     * every one of those was a render of the whole player screen. So the engine
     * hears the grab and the release; the movement in between is only ever
     * published here.
     */
    it('moves a marker through the drag, not through the engine', async () => {
      const drag = makeDrag();
      const onMarkerAChange = jest.fn();
      render({ drag, markerA: 5000, onMarkerAChange });
      layout();

      await begin(xFor(5000));
      onMarkerAChange.mockClear();

      await move(xFor(5500));
      await move(xFor(6000));
      await move(xFor(6500));

      expect(onMarkerAChange).not.toHaveBeenCalled();
      expect(drag.ms.value).toBe(6500);

      await finalize();
      expect(onMarkerAChange).toHaveBeenCalledTimes(1);
      expect(onMarkerAChange).toHaveBeenCalledWith(6500);
    });
  });

  describe('snippet preview', () => {
    it('starts, follows, and ends the preview for a marker drag', async () => {
      const onPreviewStart = jest.fn();
      const onPreviewMove = jest.fn();
      const onPreviewEnd = jest.fn();
      render({
        markerA: 5000,
        onMarkerAChange: jest.fn(),
        onPreviewStart,
        onPreviewMove,
        onPreviewEnd,
      });
      layout();

      await begin(xFor(5000));
      expect(onPreviewStart).toHaveBeenCalledWith(5000);

      await move(xFor(6000));
      await finalize();

      expect(onPreviewMove).toHaveBeenCalledWith(6000);
      expect(onPreviewEnd).toHaveBeenCalled();
    });

    it('never previews a plain seek', async () => {
      const onPreviewStart = jest.fn();
      const onPreviewEnd = jest.fn();
      render({ onPreviewStart, onPreviewEnd });
      layout();

      await begin(xFor(5000));
      await finalize();

      expect(onPreviewStart).not.toHaveBeenCalled();
      expect(onPreviewEnd).not.toHaveBeenCalled();
    });
  });
});

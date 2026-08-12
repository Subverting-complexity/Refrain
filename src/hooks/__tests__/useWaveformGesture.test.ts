import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import {
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

function TestComponent(props: UseWaveformGestureParams) {
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
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(createElement(TestComponent, props));
  });
  const rerender = () =>
    act(() => {
      tree.update(createElement(TestComponent, props));
    });
  return { props, rerender };
}

function layout(width = CONTAINER_WIDTH) {
  act(() => {
    lastResult.onLayout({
      nativeEvent: { layout: { width } },
      // The hook only reads layout.width; the rest of the event is irrelevant.
    } as Parameters<UseWaveformGesture['onLayout']>[0]);
  });
}

const begin = (x: number, y = 0) => act(() => mockHandlers.begin({ x, y }));
const move = (x: number) => act(() => mockHandlers.update({ x }));
const finalize = () => act(() => mockHandlers.finalize({}));

describe('useWaveformGesture', () => {
  it('builds the Pan gesture once across re-renders', () => {
    const { rerender } = render();
    const first = lastResult.gesture;

    rerender();

    expect(lastResult.gesture).toBe(first);
  });

  describe('routing a touch', () => {
    it('seeks on a tap when no marker is under the finger', () => {
      const { props } = render();
      layout();

      begin(xFor(5000));

      expect(props.onSeek).toHaveBeenCalledWith(5000);
    });

    it('ignores touches before the surface has been measured', () => {
      const { props } = render();

      begin(xFor(5000));

      expect(props.onSeek).not.toHaveBeenCalled();
    });

    it('ignores touches on a track of unknown length', () => {
      const { props } = render({ durationMs: 0 });
      layout();

      begin(150);

      expect(props.onSeek).not.toHaveBeenCalled();
    });

    it('grabs an existing A handle instead of seeking', () => {
      const onMarkerAChange = jest.fn();
      const { props } = render({ markerA: 5000, onMarkerAChange });
      layout();

      begin(xFor(5000));

      expect(onMarkerAChange).toHaveBeenCalledWith(5000);
      expect(props.onSeek).not.toHaveBeenCalled();
    });

    it('leaves a marker ungrabbable without a change handler', () => {
      const { props } = render({ markerA: 5000 });
      layout();

      begin(xFor(5000));

      expect(props.onSeek).toHaveBeenCalledWith(5000);
    });

    // A lives at the top of the surface and B at the bottom, so markers sitting
    // almost on top of each other stay individually selectable.
    it('splits overlapping handles by the vertical half of the touch', () => {
      const onMarkerAChange = jest.fn();
      const onMarkerBChange = jest.fn();
      render({
        markerA: 5000,
        markerB: 5100,
        onMarkerAChange,
        onMarkerBChange,
      });
      layout();

      begin(xFor(5000), 10);
      finalize();
      expect(onMarkerAChange).toHaveBeenCalled();
      expect(onMarkerBChange).not.toHaveBeenCalled();

      begin(xFor(5000), HEIGHT - 10);
      expect(onMarkerBChange).toHaveBeenCalled();
    });
  });

  describe('tap-to-place', () => {
    it('drops an armed A marker and reports the placement', () => {
      const onMarkerAChange = jest.fn();
      const onPlaceComplete = jest.fn();
      render({ placeMode: 'A', onMarkerAChange, onPlaceComplete });
      layout();

      begin(xFor(5000));
      expect(onMarkerAChange).toHaveBeenCalledWith(5000);

      finalize();
      expect(onPlaceComplete).toHaveBeenCalledWith('A');
    });

    it('does not report a placement for a fine-tune drag', () => {
      const onMarkerAChange = jest.fn();
      const onPlaceComplete = jest.fn();
      render({ markerA: 5000, onMarkerAChange, onPlaceComplete });
      layout();

      begin(xFor(5000));
      finalize();

      expect(onPlaceComplete).not.toHaveBeenCalled();
    });

    it('only seeks when nothing is armed', () => {
      const onMarkerAChange = jest.fn();
      const { props } = render({ onMarkerAChange });
      layout();

      begin(xFor(5000));

      expect(props.onSeek).toHaveBeenCalledWith(5000);
      expect(onMarkerAChange).not.toHaveBeenCalled();
    });
  });

  // The engine rejects a B at or before A, so the handle has to stop at the
  // boundary rather than keep moving and have its write silently dropped.
  it('clamps a dragged B handle to just past A', () => {
    const onMarkerBChange = jest.fn();
    render({ markerA: 5000, markerB: 8000, onMarkerBChange });
    layout();

    begin(xFor(8000), HEIGHT - 10);
    move(xFor(1000));
    finalize();

    expect(onMarkerBChange).toHaveBeenLastCalledWith(5001);
    expect(lastResult.drag).toBeNull();
  });

  describe('drag state', () => {
    it('tracks the live value and target, then clears on release', () => {
      const { rerender } = render();
      layout();

      begin(xFor(2500));
      rerender();
      expect(lastResult.drag).toEqual({ ms: 2500, target: 'seek' });

      finalize();
      rerender();
      expect(lastResult.drag).toBeNull();
    });
  });

  describe('snippet preview', () => {
    it('starts, follows, and ends the preview for a marker drag', () => {
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

      begin(xFor(5000));
      expect(onPreviewStart).toHaveBeenCalledWith(5000);

      move(xFor(6000));
      finalize();

      expect(onPreviewMove).toHaveBeenCalledWith(6000);
      expect(onPreviewEnd).toHaveBeenCalled();
    });

    it('never previews a plain seek', () => {
      const onPreviewStart = jest.fn();
      const onPreviewEnd = jest.fn();
      render({ onPreviewStart, onPreviewEnd });
      layout();

      begin(xFor(5000));
      finalize();

      expect(onPreviewStart).not.toHaveBeenCalled();
      expect(onPreviewEnd).not.toHaveBeenCalled();
    });
  });
});

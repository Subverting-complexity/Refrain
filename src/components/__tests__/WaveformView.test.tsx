import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { WaveformView } from '../WaveformView';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        border: '#2a4a4e',
        surface: '#1a2e30',
        textSecondary: '#8ba89e',
      },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
      typography: {},
    },
  }),
}));

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
    (node) =>
      node.type === 'View' &&
      typeof node.props.onResponderGrant === 'function' &&
      typeof node.props.onLayout === 'function',
  )[0];
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

    const touchArea = getTouchArea(tree);

    act(() => {
      touchArea.props.onLayout({
        nativeEvent: { layout: { width: 300 } },
      });
    });

    act(() => {
      touchArea.props.onResponderGrant({
        nativeEvent: { locationX: 150 },
      });
    });

    expect(onSeek).toHaveBeenCalledWith(5000);
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

      const touchArea = getTouchArea(tree);

      act(() => {
        touchArea.props.onLayout({
          nativeEvent: { layout: { width: 300 } },
        });
      });

      act(() => {
        touchArea.props.onResponderGrant({
          nativeEvent: { locationX: 152 },
        });
      });

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

      const touchArea = getTouchArea(tree);

      act(() => {
        touchArea.props.onLayout({
          nativeEvent: { layout: { width: 300 } },
        });
      });

      act(() => {
        touchArea.props.onResponderGrant({
          nativeEvent: { locationX: 242 },
        });
      });

      expect(onMarkerBChange).toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('continues dragging marker on move after grant near marker', () => {
      const onMarkerAChange = jest.fn();
      const onSeek = jest.fn();
      const tree = renderWaveform({
        markerA: 5000,
        durationMs: 10000,
        onMarkerAChange,
        onSeek,
      });

      const touchArea = getTouchArea(tree);

      act(() => {
        touchArea.props.onLayout({
          nativeEvent: { layout: { width: 300 } },
        });
      });

      act(() => {
        touchArea.props.onResponderGrant({
          nativeEvent: { locationX: 150 },
        });
      });

      onMarkerAChange.mockClear();

      act(() => {
        touchArea.props.onResponderMove({
          nativeEvent: { locationX: 180 },
        });
      });

      expect(onMarkerAChange).toHaveBeenCalledWith(6000);
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

      const touchArea = getTouchArea(tree);

      act(() => {
        touchArea.props.onLayout({
          nativeEvent: { layout: { width: 300 } },
        });
      });

      act(() => {
        touchArea.props.onResponderGrant({
          nativeEvent: { locationX: 30 },
        });
      });

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

      const touchArea = getTouchArea(tree);

      act(() => {
        touchArea.props.onLayout({
          nativeEvent: { layout: { width: 300 } },
        });
      });

      act(() => {
        touchArea.props.onResponderGrant({
          nativeEvent: { locationX: 150 },
        });
      });

      expect(onSeek).toHaveBeenCalled();
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

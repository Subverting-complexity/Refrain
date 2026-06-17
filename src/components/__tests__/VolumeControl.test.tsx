import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { VolumeControl } from '../VolumeControl';

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
      typography: { caption: {} },
    },
  }),
}));

const mockIsIOSWeb = jest.fn<boolean, []>();
jest.mock('../../utils/platform', () => ({
  isIOSWeb: () => mockIsIOSWeb(),
}));

const mockIsWebAudioGainSupported = jest.fn<boolean, []>();
jest.mock('../../services/webAudioGain', () => ({
  isWebAudioGainSupported: () => mockIsWebAudioGainSupported(),
}));

// Stub gesture-handler: GestureDetector renders its child and Gesture.Pan()
// records its callbacks so the test can drive begin/update/finalize directly.
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

function getToggle(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function',
  )[0];
}

function expand(tree: ReactTestRenderer) {
  act(() => {
    getToggle(tree).props.onPress();
  });
}

function renderControl(
  props: Partial<React.ComponentProps<typeof VolumeControl>> = {},
  { expanded = true }: { expanded?: boolean } = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <VolumeControl volume={0.5} onVolumeChange={jest.fn()} {...props} />,
    );
  });
  // The slider is collapsed behind the icon by default; most tests drive the
  // slider directly, so expand it unless the test opts out.
  if (expanded) expand(tree);
  return tree;
}

function getAdjustable(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.type === 'View' && node.props.accessibilityRole === 'adjustable',
  )[0];
}

function getTouchArea(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) => node.type === 'View' && typeof node.props.onLayout === 'function',
  )[0];
}

function layout(tree: ReactTestRenderer, width: number) {
  const touch = getTouchArea(tree);
  act(() => {
    touch.props.onLayout({ nativeEvent: { layout: { width } } });
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

beforeEach(() => {
  jest.clearAllMocks();
  mockIsIOSWeb.mockReturnValue(false);
  // Default: no Web Audio gain, so the iOS note reflects the legacy fallback.
  mockIsWebAudioGainSupported.mockReturnValue(false);
});

describe('VolumeControl', () => {
  it('hides the slider until the volume icon is tapped', () => {
    const tree = renderControl({ volume: 0.5 }, { expanded: false });

    // Collapsed: only the icon toggle, no adjustable slider.
    expect(getAdjustable(tree)).toBeUndefined();
    const toggle = getToggle(tree);
    expect(toggle.props.accessibilityLabel).toBe('Volume, 50%');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });

    expand(tree);

    // Expanded: slider is now present and the toggle reflects the state.
    expect(getAdjustable(tree)).toBeDefined();
    expect(getToggle(tree).props.accessibilityState).toEqual({
      expanded: true,
    });
  });

  it('collapses the slider when the icon is tapped again', () => {
    const tree = renderControl({ volume: 0.5 }, { expanded: true });
    expect(getAdjustable(tree)).toBeDefined();

    act(() => {
      getToggle(tree).props.onPress();
    });

    expect(getAdjustable(tree)).toBeUndefined();
  });

  it('sets adjustable role with a percentage label and value', () => {
    const tree = renderControl({ volume: 0.5 });
    const container = getAdjustable(tree);

    expect(container.props.accessibilityLabel).toBe('Volume: 50%');
    expect(container.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 50,
    });
  });

  it('increments volume by a step, clamped to 1', () => {
    const onVolumeChange = jest.fn();
    const tree = renderControl({ volume: 0.98, onVolumeChange });
    const container = getAdjustable(tree);

    act(() => {
      container.props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      });
    });

    expect(onVolumeChange).toHaveBeenCalledWith(1);
  });

  it('decrements volume by a step, clamped to 0', () => {
    const onVolumeChange = jest.fn();
    const tree = renderControl({ volume: 0.02, onVolumeChange });
    const container = getAdjustable(tree);

    act(() => {
      container.props.onAccessibilityAction({
        nativeEvent: { actionName: 'decrement' },
      });
    });

    expect(onVolumeChange).toHaveBeenCalledWith(0);
  });

  it('seeks volume from a tap based on touch position', () => {
    const onVolumeChange = jest.fn();
    const tree = renderControl({ volume: 0, onVolumeChange });
    layout(tree, 200);

    begin(50);

    // 50 / 200 = 0.25
    expect(onVolumeChange).toHaveBeenCalledWith(0.25);
  });

  it('updates volume while dragging and commits on release', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const onVolumeChange = jest.fn();
    const tree = renderControl({ volume: 0, onVolumeChange });
    layout(tree, 100);

    nowSpy.mockReturnValue(1000);
    begin(10);
    // Throttled move within the window — visual updates, no native call yet.
    nowSpy.mockReturnValue(1010);
    move(80);
    nowSpy.mockReturnValue(1020);
    finalize();

    // Grant fires immediately (0.1); the final value (0.8) is committed on
    // release even though the intervening move was throttled.
    expect(onVolumeChange).toHaveBeenCalledWith(0.1);
    expect(onVolumeChange).toHaveBeenLastCalledWith(0.8);
    nowSpy.mockRestore();
  });

  it('shows the iOS limitation note only on iOS web without Web Audio gain', () => {
    mockIsIOSWeb.mockReturnValue(true);
    mockIsWebAudioGainSupported.mockReturnValue(false);
    const tree = renderControl();
    const texts = tree.root.findAllByType('Text' as never);
    const hasNote = texts.some((t) =>
      JSON.stringify(t.props.children).includes('device buttons'),
    );

    expect(hasNote).toBe(true);
  });

  it('hides the iOS note on non-iOS platforms', () => {
    mockIsIOSWeb.mockReturnValue(false);
    const tree = renderControl();
    const texts = tree.root.findAllByType('Text' as never);
    const hasNote = texts.some((t) =>
      JSON.stringify(t.props.children).includes('device buttons'),
    );

    expect(hasNote).toBe(false);
  });

  it('hides the iOS note on iOS web when Web Audio gain attenuates volume', () => {
    mockIsIOSWeb.mockReturnValue(true);
    mockIsWebAudioGainSupported.mockReturnValue(true);
    const tree = renderControl();
    const texts = tree.root.findAllByType('Text' as never);
    const hasNote = texts.some((t) =>
      JSON.stringify(t.props.children).includes('device buttons'),
    );

    expect(hasNote).toBe(false);
  });
});

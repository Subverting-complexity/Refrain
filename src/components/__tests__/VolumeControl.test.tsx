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

function renderControl(
  props: Partial<React.ComponentProps<typeof VolumeControl>> = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <VolumeControl volume={0.5} onVolumeChange={jest.fn()} {...props} />,
    );
  });
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
    (node) =>
      node.type === 'View' &&
      typeof node.props.onResponderGrant === 'function' &&
      typeof node.props.onLayout === 'function',
  )[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsIOSWeb.mockReturnValue(false);
  // Default: no Web Audio gain, so the iOS note reflects the legacy fallback.
  mockIsWebAudioGainSupported.mockReturnValue(false);
});

describe('VolumeControl', () => {
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
    const touch = getTouchArea(tree);

    act(() => {
      touch.props.onLayout({ nativeEvent: { layout: { width: 200 } } });
    });
    act(() => {
      touch.props.onResponderGrant({ nativeEvent: { locationX: 50 } });
    });

    // 50 / 200 = 0.25
    expect(onVolumeChange).toHaveBeenCalledWith(0.25);
  });

  it('updates volume while dragging and commits on release', () => {
    const onVolumeChange = jest.fn();
    const tree = renderControl({ volume: 0, onVolumeChange });
    const touch = getTouchArea(tree);

    act(() => {
      touch.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
    });
    act(() => {
      touch.props.onResponderGrant({ nativeEvent: { locationX: 10 } });
    });
    act(() => {
      touch.props.onResponderMove({ nativeEvent: { locationX: 80 } });
    });
    act(() => {
      touch.props.onResponderRelease();
    });

    // Grant fires immediately (0.1); the final value (0.8) is committed on
    // release even though the intervening move was throttled.
    expect(onVolumeChange).toHaveBeenCalledWith(0.1);
    expect(onVolumeChange).toHaveBeenLastCalledWith(0.8);
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

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import PlayerScreen from '../player';

const mockSetMarkerB = jest.fn<boolean, [number]>();

const mockAudioPlayerState = {
  status: 'paused' as const,
  positionMs: 1000,
  durationMs: 10000,
  markerA: 5000,
  markerB: null as number | null,
  lastError: undefined as string | undefined,
  volume: 1,
  play: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(),
  seekTo: jest.fn(),
  setMarkerA: jest.fn(),
  setMarkerB: (ms: number) => mockSetMarkerB(ms),
  clearMarkers: jest.fn(),
  setVolume: jest.fn(),
};

jest.mock('@/src/hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => mockAudioPlayerState,
}));

jest.mock('@/src/hooks/useWaveformData', () => ({
  useWaveformData: () => ({ peaks: [] }),
}));

jest.mock('@/src/hooks/useCountdown', () => ({
  useCountdown: () => ({
    countdownState: { phase: 'idle' },
    countdownConfig: {},
    setCountdownConfig: jest.fn(),
    playWithCountdown: jest.fn(),
    cancelCountdown: jest.fn(),
  }),
}));

jest.mock('@/src/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#000',
        surface: '#111',
        accent: '#0f0',
        accentText: '#000',
        textPrimary: '#fff',
        textSecondary: '#aaa',
        border: '#333',
        error: '#f00',
      },
      typography: { heading: {}, body: {}, bodySmall: {}, caption: {} },
    },
  }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    uri: 'file:///test.mp3',
    filename: 'test.mp3',
    trackId: 't1',
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('@/src/services/trackStore', () => ({
  updateTrackDuration: jest.fn(),
}));

// Stub the non-essential children so the test focuses on marker feedback.
jest.mock('@/src/components/CountdownOverlay', () => ({
  CountdownOverlay: () => null,
}));
jest.mock('@/src/components/CountdownSettings', () => ({
  CountdownSettings: () => null,
}));
jest.mock('@/src/components/SeekBar', () => ({ SeekBar: () => null }));
jest.mock('@/src/components/VolumeControl', () => ({
  VolumeControl: () => null,
}));
jest.mock('@/src/components/TransportControls', () => ({
  TransportControls: () => null,
}));

function pressSetMarkerB(tree: ReactTestRenderer) {
  const button = tree.root.find(
    (node) => node.props.accessibilityLabel === 'Set loop end',
  );
  act(() => {
    button.props.onPress();
  });
}

function findToastMessage(tree: ReactTestRenderer): string | undefined {
  const alert = tree.root.findAll(
    (node) => node.props.accessibilityRole === 'alert',
  )[0];
  return alert?.props.accessibilityLabel;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAudioPlayerState.markerB = null;
});

afterEach(() => {
  act(() => {
    jest.runAllTimers();
  });
  jest.useRealTimers();
});

describe('PlayerScreen marker B feedback', () => {
  it('announces and shows a toast when B is rejected before A', () => {
    const announceSpy = jest.spyOn(
      AccessibilityInfo,
      'announceForAccessibility',
    );
    mockSetMarkerB.mockReturnValue(false);

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    pressSetMarkerB(tree);

    expect(mockSetMarkerB).toHaveBeenCalledWith(1000);
    expect(announceSpy).toHaveBeenCalledWith(
      'Loop end must come after loop start',
    );
    expect(findToastMessage(tree)).toBe('Loop end must come after loop start');
  });

  it('does not announce or toast when B is accepted', () => {
    const announceSpy = jest.spyOn(
      AccessibilityInfo,
      'announceForAccessibility',
    );
    mockSetMarkerB.mockReturnValue(true);

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    pressSetMarkerB(tree);

    expect(mockSetMarkerB).toHaveBeenCalledWith(1000);
    expect(announceSpy).not.toHaveBeenCalled();
    expect(findToastMessage(tree)).toBeUndefined();
  });
});

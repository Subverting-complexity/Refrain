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
  loopEnabled: true,
  lastError: undefined as string | undefined,
  volume: 1,
  play: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(),
  seekTo: jest.fn(),
  skipBy: jest.fn(),
  setMarkerA: jest.fn(),
  setMarkerB: (ms: number) => mockSetMarkerB(ms),
  clearMarkers: jest.fn(),
  clearMarkerB: jest.fn(),
  setLoopEnabled: jest.fn(),
  setLoopRestartHandler: jest.fn(),
  setVolume: jest.fn(),
  startMonitor: jest.fn(),
  updateMonitor: jest.fn(),
  stopMonitor: jest.fn(),
};

let mockSnippetPreviewEnabled = true;
const mockSetSnippetPreviewEnabled = jest.fn<void, [boolean]>();

// Render the gesture-handler ScrollView as a plain View and stub the gesture
// API; the screen only needs them to mount (the waveform itself falls back to
// the placeholder when there are no peaks).
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const panApi: Record<string, () => unknown> = {};
  [
    'runOnJS',
    'minDistance',
    'enabled',
    'onBegin',
    'onStart',
    'onUpdate',
    'onEnd',
    'onFinalize',
  ].forEach((m) => {
    panApi[m] = () => panApi;
  });
  return {
    ScrollView: View,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Pan: () => panApi },
  };
});

jest.mock('@/src/hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => mockAudioPlayerState,
}));

jest.mock('@/src/hooks/useSnippetPreview', () => ({
  useSnippetPreview: () => ({
    snippetPreviewEnabled: mockSnippetPreviewEnabled,
    setSnippetPreviewEnabled: mockSetSnippetPreviewEnabled,
  }),
}));

jest.mock('@/src/hooks/useWaveformData', () => ({
  useWaveformData: () => ({ peaks: [0.4, 0.6, 0.8, 0.5, 0.3] }),
}));

jest.mock('@/src/hooks/useSkipInterval', () => ({
  useSkipInterval: () => ({
    skipSeconds: 5,
    skipMs: 5000,
    setSkipSeconds: jest.fn(),
  }),
  SKIP_PRESETS: [1, 2, 5, 10],
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
        markerA: '#ffb02e',
        markerAText: '#3a2600',
        markerB: '#ff5d77',
        markerBText: '#fff',
      },
      typography: { heading: {}, body: {}, bodySmall: {}, caption: {} },
    },
  }),
}));

// Capture the navigation beforeRemove listener so a test can fire the
// leave-the-player guard, and the dispatch the resolved guard re-issues.
let mockBeforeRemoveCb: ((event: unknown) => void) | null = null;
const mockDispatch = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    uri: 'file:///test.mp3',
    filename: 'test.mp3',
    trackId: 't1',
  }),
  useNavigation: () => ({
    addListener: (event: string, cb: (e: unknown) => void) => {
      if (event === 'beforeRemove') mockBeforeRemoveCb = cb;
      return () => {
        mockBeforeRemoveCb = null;
      };
    },
    dispatch: mockDispatch,
  }),
}));

const mockSave = jest.fn(() => Promise.resolve(null));
const mockUpdate = jest.fn();
const mockRename = jest.fn();
const mockRemove = jest.fn();
let mockProfiles: import('@/src/types').SegmentProfile[] = [];
jest.mock('@/src/hooks/useSegmentProfiles', () => ({
  useSegmentProfiles: () => ({
    profiles: mockProfiles,
    refresh: jest.fn(),
    save: mockSave,
    update: mockUpdate,
    rename: mockRename,
    remove: mockRemove,
  }),
}));

const mockMarkLoaded = jest.fn();
const mockClearLoaded = jest.fn();
const mockEditor = { loadedId: null as string | null, isDirty: false };
jest.mock('@/src/hooks/useSegmentEditor', () => ({
  useSegmentEditor: () => ({
    loadedId: mockEditor.loadedId,
    isDirty: mockEditor.isDirty,
    markLoaded: mockMarkLoaded,
    clearLoaded: mockClearLoaded,
  }),
}));

let mockSaveDialogProps:
  | import('@/src/components/SegmentSaveDialog').SegmentSaveDialogProps
  | null = null;
jest.mock('@/src/components/SegmentSaveDialog', () => ({
  SegmentSaveDialog: (
    props: import('@/src/components/SegmentSaveDialog').SegmentSaveDialogProps,
  ) => {
    mockSaveDialogProps = props;
    return null;
  },
}));

let mockGuardProps:
  | import('@/src/components/UnsavedSegmentDialog').UnsavedSegmentDialogProps
  | null = null;
jest.mock('@/src/components/UnsavedSegmentDialog', () => ({
  UnsavedSegmentDialog: (
    props: import('@/src/components/UnsavedSegmentDialog').UnsavedSegmentDialogProps,
  ) => {
    mockGuardProps = props;
    return null;
  },
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

// Capture the sheet's props so a test can drive its onLoadProfile callback and
// confirm the player applies a loaded profile to the engine setters.
let mockSheetProps:
  | import('@/src/components/SegmentProfileSheet').SegmentProfileSheetProps
  | null = null;
jest.mock('@/src/components/SegmentProfileSheet', () => ({
  SegmentProfileSheet: (
    props: import('@/src/components/SegmentProfileSheet').SegmentProfileSheetProps,
  ) => {
    mockSheetProps = props;
    return null;
  },
}));

// B placement now happens on the waveform (the dedicated "Set B" button is
// gone), so drive the screen's handler through the WaveformView's
// onMarkerBChange prop — the same path a tap-to-place gesture would take.
function placeMarkerB(tree: ReactTestRenderer, ms: number) {
  const waveform = tree.root.findAll(
    (node) => typeof node.props.onMarkerBChange === 'function',
  )[0];
  act(() => {
    waveform.props.onMarkerBChange(ms);
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
  mockSnippetPreviewEnabled = true;
  mockSheetProps = null;
  mockProfiles = [];
  mockEditor.loadedId = null;
  mockEditor.isDirty = false;
  mockSaveDialogProps = null;
  mockGuardProps = null;
  mockBeforeRemoveCb = null;
  mockSave.mockResolvedValue(null);
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

    placeMarkerB(tree, 1000);

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

    placeMarkerB(tree, 1000);

    expect(mockSetMarkerB).toHaveBeenCalledWith(1000);
    expect(announceSpy).not.toHaveBeenCalled();
    expect(findToastMessage(tree)).toBeUndefined();
  });
});

function getWaveform(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) => typeof node.props.onMarkerBChange === 'function',
  )[0];
}

function getSnippetToggle(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityRole === 'switch' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Snippet preview'),
  )[0];
}

describe('PlayerScreen snippet preview', () => {
  it('renders the snippet preview toggle', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    expect(getSnippetToggle(tree)).toBeDefined();
  });

  it('persists the preference when the toggle is pressed', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => getSnippetToggle(tree).props.onPress());

    // Default is on, so a press turns it off.
    expect(mockSetSnippetPreviewEnabled).toHaveBeenCalledWith(false);
  });

  it('wires marker-drag preview to the engine monitor when enabled', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    const waveform = getWaveform(tree);
    expect(typeof waveform.props.onPreviewStart).toBe('function');
    expect(typeof waveform.props.onPreviewMove).toBe('function');
    expect(typeof waveform.props.onPreviewEnd).toBe('function');

    act(() => waveform.props.onPreviewStart(4000));
    expect(mockAudioPlayerState.startMonitor).toHaveBeenCalledWith(4000);

    act(() => waveform.props.onPreviewMove(4200));
    expect(mockAudioPlayerState.updateMonitor).toHaveBeenCalledWith(4200);

    act(() => waveform.props.onPreviewEnd());
    expect(mockAudioPlayerState.stopMonitor).toHaveBeenCalled();
  });

  it('never invokes the monitor when the preference is off', () => {
    mockSnippetPreviewEnabled = false;

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    const waveform = getWaveform(tree);
    expect(waveform.props.onPreviewStart).toBeUndefined();
    expect(waveform.props.onPreviewMove).toBeUndefined();
    expect(waveform.props.onPreviewEnd).toBeUndefined();
    expect(mockAudioPlayerState.startMonitor).not.toHaveBeenCalled();
  });
});

function getSegmentsButton(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Open segment profiles' &&
      typeof node.props.onPress === 'function',
  )[0];
}

describe('PlayerScreen segment profiles', () => {
  it('mounts the sheet only after the Segments button is pressed', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    expect(mockSheetProps).toBeNull();

    act(() => {
      getSegmentsButton(tree).props.onPress();
    });

    expect(mockSheetProps).not.toBeNull();
    expect(mockSheetProps?.profiles).toEqual([]);
    expect(typeof mockSheetProps?.onLoadProfile).toBe('function');
  });

  it('applies a loaded profile to the engine setters (A before B, then loop)', () => {
    mockSetMarkerB.mockReturnValue(true);

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => {
      getSegmentsButton(tree).props.onPress();
    });
    act(() => {
      mockSheetProps?.onLoadProfile(loadedProfile('p1', 'Verse'));
    });

    expect(mockAudioPlayerState.setMarkerA).toHaveBeenCalledWith(1000);
    expect(mockSetMarkerB).toHaveBeenCalledWith(5000);
    expect(mockAudioPlayerState.setLoopEnabled).toHaveBeenCalledWith(false);
    expect(mockMarkLoaded).toHaveBeenCalled();
  });
});

function loadedProfile(
  id: string,
  name: string,
): import('@/src/types').SegmentProfile {
  return {
    id,
    trackId: 't1',
    name,
    markerA: 1000,
    markerB: 5000,
    loopEnabled: false,
    createdAt: 1,
  };
}

function getSaveButton(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Save segment' &&
      typeof node.props.onPress === 'function',
  )[0];
}

describe('PlayerScreen segment save', () => {
  it('disables the Save button without a valid A/B region', () => {
    mockAudioPlayerState.markerB = null;

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    const button = getSaveButton(tree);
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(button.props.disabled).toBe(true);
  });

  it('creates a new segment when nothing is loaded', () => {
    mockAudioPlayerState.markerB = 8000;

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => getSaveButton(tree).props.onPress());
    expect(mockSaveDialogProps?.loadedName).toBeNull();

    act(() => mockSaveDialogProps?.onSaveNew('Bridge'));

    expect(mockSave).toHaveBeenCalledWith({
      name: 'Bridge',
      markerA: 5000,
      markerB: 8000,
      loopEnabled: true,
    });
  });

  it('offers override when a dirty segment is loaded', () => {
    mockAudioPlayerState.markerB = 8000;
    mockEditor.loadedId = 'p1';
    mockEditor.isDirty = true;
    mockProfiles = [loadedProfile('p1', 'Verse')];

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => getSaveButton(tree).props.onPress());
    expect(mockSaveDialogProps?.loadedName).toBe('Verse');

    act(() => mockSaveDialogProps?.onOverride());

    expect(mockUpdate).toHaveBeenCalledWith('p1', {
      markerA: 5000,
      markerB: 8000,
      loopEnabled: true,
    });
  });
});

describe('PlayerScreen unsaved-edit guard', () => {
  it('defers loading a different segment while dirty', () => {
    mockSetMarkerB.mockReturnValue(true);
    mockEditor.loadedId = 'p1';
    mockEditor.isDirty = true;
    mockProfiles = [loadedProfile('p1', 'Verse')];

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => {
      getSegmentsButton(tree).props.onPress();
    });
    act(() => {
      mockSheetProps?.onLoadProfile(loadedProfile('p2', 'Chorus'));
    });

    // The load is held behind the guard, not applied yet.
    expect(mockGuardProps).not.toBeNull();
    expect(mockAudioPlayerState.setMarkerA).not.toHaveBeenCalled();

    // Discard applies the pending load.
    act(() => mockGuardProps?.onDiscard());
    expect(mockAudioPlayerState.setMarkerA).toHaveBeenCalledWith(1000);
  });

  it('raises the guard on back navigation while dirty, then dispatches on save', () => {
    mockEditor.loadedId = 'p1';
    mockEditor.isDirty = true;
    mockProfiles = [loadedProfile('p1', 'Verse')];

    act(() => {
      create(<PlayerScreen />);
    });

    const preventDefault = jest.fn();
    const action = { type: 'GO_BACK' };
    act(() => {
      mockBeforeRemoveCb?.({ preventDefault, data: { action } });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(mockGuardProps).not.toBeNull();

    act(() => mockGuardProps?.onSave());

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it('does not block back navigation when not dirty', () => {
    mockEditor.loadedId = 'p1';
    mockEditor.isDirty = false;

    act(() => {
      create(<PlayerScreen />);
    });

    const preventDefault = jest.fn();
    act(() => {
      mockBeforeRemoveCb?.({
        preventDefault,
        data: { action: { type: 'GO_BACK' } },
      });
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockGuardProps).toBeNull();
  });
});

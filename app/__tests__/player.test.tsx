import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import PlayerScreen from '../player';
import { updateTrackDuration } from '@/src/services/trackStore';

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
  seekTo: jest.fn(),
  skipBy: jest.fn(),
  setMarkerA: jest.fn(),
  setMarkerB: (ms: number) => mockSetMarkerB(ms),
  clearMarkers: jest.fn(),
  clearMarkerB: jest.fn(),
  commitMarkerPlacement: jest.fn(),
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

// Captures what the screen actually hands the engine, so a test can assert it
// loads the store-resolved uri rather than the one sitting in the route.
let mockUseAudioPlayerArgs: unknown[] = [];
jest.mock('@/src/hooks/useAudioPlayer', () => ({
  useAudioPlayer: (...args: unknown[]) => {
    mockUseAudioPlayerArgs = args;
    return mockAudioPlayerState;
  },
}));

jest.mock('@/src/hooks/useSnippetPreview', () => ({
  useSnippetPreview: () => ({
    snippetPreviewEnabled: mockSnippetPreviewEnabled,
    setSnippetPreviewEnabled: mockSetSnippetPreviewEnabled,
  }),
}));

let mockWaveformPeaks: number[] = [0.4, 0.6, 0.8, 0.5, 0.3];
let mockWaveformLoading = false;
jest.mock('@/src/hooks/useWaveformData', () => ({
  useWaveformData: () => ({
    peaks: mockWaveformPeaks,
    isLoading: mockWaveformLoading,
  }),
}));

jest.mock('@/src/hooks/useSkipInterval', () => ({
  useSkipInterval: () => ({
    skipSeconds: 5,
    skipMs: 5000,
    setSkipSeconds: jest.fn(),
  }),
  SKIP_PRESETS: [1, 3, 5, 10, 15, 30],
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
const mockSetOptions = jest.fn();
// Mutable so a test can change the active trackId between renders without
// remounting, simulating expo-router reusing the component instance (#168).
const mockParams = {
  uri: 'file:///test.mp3',
  filename: 'test.mp3',
  trackId: 't1',
};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({
    addListener: (event: string, cb: (e: unknown) => void) => {
      if (event === 'beforeRemove') mockBeforeRemoveCb = cb;
      return () => {
        mockBeforeRemoveCb = null;
      };
    },
    dispatch: mockDispatch,
    setOptions: mockSetOptions,
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

// The player re-resolves its playable uri from the track id on mount, so the
// store mock has to answer `getTrack` as well as the duration write.
const mockGetTrack = jest.fn();
jest.mock('@/src/services/trackStore', () => ({
  updateTrackDuration: jest.fn(),
  getTrack: (id: string) => mockGetTrack(id),
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
  mockParams.trackId = 't1';
  mockParams.uri = 'file:///test.mp3';
  mockUseAudioPlayerArgs = [];
  mockWaveformPeaks = [0.4, 0.6, 0.8, 0.5, 0.3];
  mockWaveformLoading = false;
  mockSave.mockResolvedValue(null);
  mockGetTrack.mockResolvedValue({
    id: 't1',
    filename: 'test.mp3',
    uri: 'file:///test.mp3',
    format: 'mp3',
    durationMs: 10000,
    durationEstimated: false,
    fileSizeBytes: 100,
    importedAt: 1,
  });
});

afterEach(async () => {
  act(() => {
    jest.runAllTimers();
  });
  // Trees mounted by a test are left mounted, and the screen's track-source
  // lookup settles on a microtask. Flush those here so a previous test's
  // pending resolution re-renders its own tree inside its own teardown,
  // instead of landing mid-way through the next test and clobbering the
  // module-level props captured by the child mocks.
  await act(async () => {});
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

function getMarkerControls(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) => typeof node.props.onEditA === 'function',
  )[0];
}

describe('PlayerScreen marker commit', () => {
  it('reports a settled waveform gesture to the engine', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => {
      getWaveform(tree).props.onMarkerCommit('A');
    });

    expect(mockAudioPlayerState.commitMarkerPlacement).toHaveBeenCalledWith(
      'A',
    );
  });

  it('does not commit on every marker change during a drag', () => {
    mockSetMarkerB.mockReturnValue(true);

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    // The throttled drag callbacks fire ~20x/sec; seeking at that cadence is
    // exactly what the commit split avoids.
    act(() => {
      getWaveform(tree).props.onMarkerAChange(2000);
      getWaveform(tree).props.onMarkerBChange(8000);
    });

    expect(mockAudioPlayerState.commitMarkerPlacement).not.toHaveBeenCalled();
  });

  it('commits an A time typed into the marker sheet', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => {
      getMarkerControls(tree).props.onEditA(2000);
    });

    expect(mockAudioPlayerState.setMarkerA).toHaveBeenCalledWith(2000);
    expect(mockAudioPlayerState.commitMarkerPlacement).toHaveBeenCalledWith(
      'A',
    );
  });

  it('commits a B time typed into the marker sheet', () => {
    mockSetMarkerB.mockReturnValue(true);

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => {
      getMarkerControls(tree).props.onEditB(8000);
    });

    expect(mockSetMarkerB).toHaveBeenCalledWith(8000);
    expect(mockAudioPlayerState.commitMarkerPlacement).toHaveBeenCalledWith(
      'B',
    );
  });

  it('does not commit a B time the engine rejects', () => {
    mockSetMarkerB.mockReturnValue(false);

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => {
      getMarkerControls(tree).props.onEditB(1000);
    });

    expect(mockAudioPlayerState.commitMarkerPlacement).not.toHaveBeenCalled();
    expect(findToastMessage(tree)).toBe('Loop end must come after loop start');
  });
});

describe('PlayerScreen header title', () => {
  it('folds the track filename into the navigation header', () => {
    act(() => {
      create(<PlayerScreen />);
    });

    expect(mockSetOptions).toHaveBeenCalledWith({ title: 'test.mp3' });
  });
});

describe('PlayerScreen snippet preview', () => {
  it('passes snippet-preview state into the Segments sheet', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => {
      getSegmentsButton(tree).props.onPress();
    });

    expect(mockSheetProps?.snippetPreviewEnabled).toBe(true);
    expect(typeof mockSheetProps?.onSnippetPreviewChange).toBe('function');
  });

  it('persists the preference when the sheet toggles it', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => {
      getSegmentsButton(tree).props.onPress();
    });
    act(() => mockSheetProps?.onSnippetPreviewChange(false));

    // Default is on, so a toggle turns it off.
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

  it('parks the playhead at the loaded segment start, exactly once', () => {
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

    // One commit for the load, not one per marker.
    expect(mockAudioPlayerState.commitMarkerPlacement).toHaveBeenCalledTimes(1);
    expect(mockAudioPlayerState.commitMarkerPlacement).toHaveBeenCalledWith(
      'A',
    );
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
    expect(button.props.disabled).toBe(true);
  });

  it('creates a new segment when nothing is loaded', async () => {
    mockAudioPlayerState.markerB = 8000;
    mockSave.mockResolvedValue(loadedProfile('p9', 'Bridge'));

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => getSaveButton(tree).props.onPress());
    expect(mockSaveDialogProps?.loadedName).toBeNull();

    await act(async () => {
      mockSaveDialogProps?.onSaveNew('Bridge');
    });

    expect(mockSave).toHaveBeenCalledWith({
      name: 'Bridge',
      markerA: 5000,
      markerB: 8000,
      loopEnabled: true,
    });
  });

  it('shows the success toast only after the save resolves with a profile', async () => {
    mockAudioPlayerState.markerB = 8000;
    mockSave.mockResolvedValue(loadedProfile('p9', 'Bridge'));

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => getSaveButton(tree).props.onPress());

    // Fire the save but do not flush its promise yet: the toast must not
    // appear before the write resolves.
    act(() => {
      mockSaveDialogProps?.onSaveNew('Bridge');
    });
    expect(mockMarkLoaded).not.toHaveBeenCalled();
    expect(findToastMessage(tree)).toBeUndefined();

    // Flush the resolution: now the profile is adopted and success is shown.
    await act(async () => {});
    expect(mockMarkLoaded).toHaveBeenCalledWith(loadedProfile('p9', 'Bridge'));
    expect(findToastMessage(tree)).toBe('Segment saved');
  });

  it('shows an error toast and does not claim success on a falsy save', async () => {
    mockAudioPlayerState.markerB = 8000;
    mockSave.mockResolvedValue(null);

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => getSaveButton(tree).props.onPress());
    await act(async () => {
      mockSaveDialogProps?.onSaveNew('Bridge');
    });

    expect(mockMarkLoaded).not.toHaveBeenCalled();
    expect(findToastMessage(tree)).toBe('Could not save segment');
  });

  it('handles a rejected save with an error toast and no success claim', async () => {
    mockAudioPlayerState.markerB = 8000;
    mockSave.mockRejectedValue(new Error('store down'));

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    act(() => getSaveButton(tree).props.onPress());
    await act(async () => {
      mockSaveDialogProps?.onSaveNew('Bridge');
    });

    expect(mockMarkLoaded).not.toHaveBeenCalled();
    expect(findToastMessage(tree)).toBe('Could not save segment');
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

  it('advances the dirty baseline when the guard is resolved with Save', () => {
    // Regression (#166): guard-save persisted the markers but never moved the
    // in-memory baseline, so the segment re-reported as dirty against its stale
    // snapshot and re-triggered the dialog on already-saved data.
    mockAudioPlayerState.markerB = 8000;
    mockEditor.loadedId = 'p1';
    mockEditor.isDirty = true;
    mockProfiles = [loadedProfile('p1', 'Verse')];

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

    act(() => mockGuardProps?.onSave());

    // The baseline moves to the just-saved live markers, mirroring an override
    // save — re-marking to the current A/B is what clears the dirty flag.
    expect(mockMarkLoaded).toHaveBeenCalledWith({
      id: 'p1',
      markerA: 5000,
      markerB: 8000,
    });
  });

  it('re-arms the guard after a bypassed navigation that stays on the screen', () => {
    mockEditor.loadedId = 'p1';
    mockEditor.isDirty = true;
    mockProfiles = [loadedProfile('p1', 'Verse')];

    act(() => {
      create(<PlayerScreen />);
    });

    // First back-nav: guard fires, user saves, dispatch proceeds.
    const preventDefault1 = jest.fn();
    const action1 = { type: 'GO_BACK' };
    act(() => {
      mockBeforeRemoveCb?.({
        preventDefault: preventDefault1,
        data: { action: action1 },
      });
    });
    expect(preventDefault1).toHaveBeenCalled();
    expect(mockGuardProps).not.toBeNull();

    act(() => mockGuardProps?.onSave());
    expect(mockDispatch).toHaveBeenCalledWith(action1);

    // Simulate the screen staying mounted (navigation didn't unmount it).
    // Reset mocks to isolate the second navigation attempt.
    mockDispatch.mockClear();
    mockGuardProps = null;

    // Second back-nav while still dirty: the guard must fire again.
    const preventDefault2 = jest.fn();
    const action2 = { type: 'GO_BACK' };
    act(() => {
      mockBeforeRemoveCb?.({
        preventDefault: preventDefault2,
        data: { action: action2 },
      });
    });

    expect(preventDefault2).toHaveBeenCalled();
    expect(mockGuardProps).not.toBeNull();
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

describe('PlayerScreen duration persistence', () => {
  const mockUpdateTrackDuration = updateTrackDuration as jest.MockedFunction<
    typeof updateTrackDuration
  >;

  it('persists the measured duration once on mount', () => {
    act(() => {
      create(<PlayerScreen />);
    });

    // durationMs is 10000 in the mocked engine state.
    expect(mockUpdateTrackDuration).toHaveBeenCalledTimes(1);
    expect(mockUpdateTrackDuration).toHaveBeenCalledWith('t1', 10000);
  });

  it('persists the new track when trackId changes without a remount (#168)', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlayerScreen />);
    });

    expect(mockUpdateTrackDuration).toHaveBeenCalledWith('t1', 10000);

    // expo-router reuses the instance for a different track: the param changes
    // and the screen re-renders without remounting. The persist guard must
    // reset so the second track's duration is not silently dropped.
    mockParams.trackId = 't2';
    act(() => {
      tree.update(<PlayerScreen />);
    });

    expect(mockUpdateTrackDuration).toHaveBeenCalledWith('t2', 10000);
    expect(mockUpdateTrackDuration).toHaveBeenCalledTimes(2);
  });
});

// A uri captured at navigation time goes stale: on web `Track.uri` is a
// `blob:` object URL that dies with the document, so reloading the player
// route left it pointing at nothing and playback failed with a bare media
// error. The screen re-resolves from the track id instead.
describe('PlayerScreen track source', () => {
  const resolved = {
    id: 't1',
    filename: 'resolved.mp3',
    uri: 'blob:freshly-minted',
    format: 'mp3',
    durationMs: 10000,
    durationEstimated: false,
    fileSizeBytes: 100,
    importedAt: 1,
  };

  it('loads the uri resolved from the store, not the one in the route', async () => {
    mockGetTrack.mockResolvedValue(resolved);

    await act(async () => {
      create(<PlayerScreen />);
    });

    expect(mockGetTrack).toHaveBeenCalledWith('t1');
    expect(mockUseAudioPlayerArgs).toEqual([
      'blob:freshly-minted',
      't1',
      'resolved.mp3',
    ]);
  });

  it('titles the header from the resolved filename', async () => {
    mockGetTrack.mockResolvedValue(resolved);

    await act(async () => {
      create(<PlayerScreen />);
    });

    expect(mockSetOptions).toHaveBeenLastCalledWith({ title: 'resolved.mp3' });
  });

  it('tells the user when the track is gone from the library', async () => {
    mockGetTrack.mockResolvedValue(null);
    mockParams.uri = '';

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<PlayerScreen />);
    });

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('This track is no longer in your library');
    // The generic playback-error banner must not also fire — one clear
    // explanation, not two competing ones.
    expect(json).not.toContain('Unable to load this track');
  });

  it('falls back to a uri supplied by the route when the id is unknown', async () => {
    mockGetTrack.mockResolvedValue(null);

    await act(async () => {
      create(<PlayerScreen />);
    });

    expect(mockUseAudioPlayerArgs[0]).toBe('file:///test.mp3');
  });

  it('shows a loading affordance while the store lookup is in flight', async () => {
    let settle!: (value: unknown) => void;
    mockGetTrack.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    mockWaveformPeaks = [];

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<PlayerScreen />);
    });

    expect(
      tree.root.findAll(
        (node) => node.props.accessibilityLabel === 'Loading waveform',
      ).length,
    ).toBeGreaterThanOrEqual(1);

    await act(async () => {
      settle(null);
    });
  });
});

import { createElement } from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { useAudioPlayer } from '../useAudioPlayer';
import { PlaybackState } from '../../types';

const IDLE_STATE: PlaybackState = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  markerA: null,
  markerB: null,
  loopEnabled: true,
  volume: 1,
};

// The engine as the hook now sees it: a store with a current snapshot and a
// set of listeners. `useAudioPlayer` reads it through a selector, so a snapshot
// has to be readable on demand and not only pushed. Both carry the `mock`
// prefix because the module factory below closes over them, and Jest only
// allows a hoisted factory to reach names spelled that way.
let mockEngineState: PlaybackState = IDLE_STATE;
const mockSubscribers = new Set<(state: PlaybackState) => void>();

function publish(next: PlaybackState): void {
  mockEngineState = next;
  for (const listener of mockSubscribers) listener(next);
}

const mockLoadTrack = jest.fn<
  Promise<void>,
  [string, string | undefined, string | undefined]
>();
const mockUnloadTrack = jest.fn<Promise<void>, []>();
const mockSetVolume = jest.fn<void, [number]>();
const mockSetMarkerB = jest.fn<boolean, [number]>();
const mockSetLoopEnabled = jest.fn<void, [boolean]>();
const mockLoadPersistedVolume = jest.fn<void, []>();
const mockStartMonitor = jest.fn<Promise<void>, [number]>();
const mockUpdateMonitor = jest.fn<void, [number]>();
const mockStopMonitor = jest.fn<Promise<void>, []>();
const mockCommitMarkerPlacement = jest.fn<Promise<void>, ['A' | 'B']>();

jest.mock('../../services/audioEngine', () => ({
  subscribe: (cb: (state: PlaybackState) => void) => {
    mockSubscribers.add(cb);
    return () => {
      mockSubscribers.delete(cb);
    };
  },
  getState: () => mockEngineState,
  loadTrack: (uri: string, trackId?: string, trackName?: string) =>
    mockLoadTrack(uri, trackId, trackName),
  unloadTrack: () => mockUnloadTrack(),
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(),
  setMarkerA: jest.fn(),
  setMarkerB: (ms: number) => mockSetMarkerB(ms),
  clearMarkers: jest.fn(),
  setLoopEnabled: (enabled: boolean) => mockSetLoopEnabled(enabled),
  setVolume: (v: number) => mockSetVolume(v),
  loadPersistedVolume: () => mockLoadPersistedVolume(),
  startMonitor: (ms: number) => mockStartMonitor(ms),
  updateMonitor: (ms: number) => mockUpdateMonitor(ms),
  stopMonitor: () => mockStopMonitor(),
  commitMarkerPlacement: (placed: 'A' | 'B') =>
    mockCommitMarkerPlacement(placed),
}));

let lastResult: ReturnType<typeof useAudioPlayer>;
let renders = 0;

function TestComponent({
  uri,
  trackId,
  trackName,
}: {
  uri: string | null;
  trackId?: string | null;
  trackName?: string | null;
}) {
  renders += 1;
  lastResult = useAudioPlayer(uri, trackId, trackName);
  return null;
}

function renderHook(
  uri: string | null,
  trackId?: string | null,
  trackName?: string | null,
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent, { uri, trackId, trackName }));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEngineState = IDLE_STATE;
  mockSubscribers.clear();
  mockLoadTrack.mockResolvedValue(undefined);
  mockUnloadTrack.mockResolvedValue(undefined);
});

describe('useAudioPlayer', () => {
  it('starts in idle state and does not load when uri is null', () => {
    renderHook(null);

    expect(lastResult.status).toBe('idle');
    expect(mockLoadTrack).not.toHaveBeenCalled();
  });

  it('loads the track when given a uri', () => {
    renderHook('file:///test.mp3');

    expect(mockLoadTrack).toHaveBeenCalledWith(
      'file:///test.mp3',
      undefined,
      undefined,
    );
  });

  it('forwards the track id to the engine so markers can be restored', () => {
    renderHook('file:///test.mp3', 'track-42');

    expect(mockLoadTrack).toHaveBeenCalledWith(
      'file:///test.mp3',
      'track-42',
      undefined,
    );
  });

  it('forwards the track name to the engine for lock screen controls', () => {
    renderHook('file:///test.mp3', 'track-42', 'My Song');

    expect(mockLoadTrack).toHaveBeenCalledWith(
      'file:///test.mp3',
      'track-42',
      'My Song',
    );
  });

  it('propagates the error status and lastError from the engine', () => {
    renderHook('file:///bad.mp3');

    act(() => {
      publish({
        ...IDLE_STATE,
        status: 'error',
        lastError: 'unsupported format',
      });
    });

    expect(lastResult.status).toBe('error');
    expect(lastResult.lastError).toBe('unsupported format');
  });

  it('does not throw when loadTrack rejects (no unhandled rejection)', async () => {
    mockLoadTrack.mockRejectedValueOnce(new Error('boom'));

    await act(async () => {
      create(createElement(TestComponent, { uri: 'file:///bad.mp3' }));
      // allow the rejected loadTrack promise to settle
      await Promise.resolve();
    });

    expect(mockLoadTrack).toHaveBeenCalledWith(
      'file:///bad.mp3',
      undefined,
      undefined,
    );
  });

  it('unloads the track on unmount', () => {
    const tree = renderHook('file:///test.mp3');

    act(() => {
      tree.unmount();
    });

    expect(mockUnloadTrack).toHaveBeenCalled();
  });

  it('loads the persisted volume once on mount', () => {
    renderHook(null);

    expect(mockLoadPersistedVolume).toHaveBeenCalledTimes(1);
  });

  it('exposes volume from engine state', () => {
    renderHook('file:///test.mp3');

    act(() => {
      publish({ ...IDLE_STATE, volume: 0.4 });
    });

    expect(lastResult.volume).toBe(0.4);
  });

  it('forwards setVolume to the engine', () => {
    renderHook('file:///test.mp3');

    act(() => {
      lastResult.setVolume(0.25);
    });

    expect(mockSetVolume).toHaveBeenCalledWith(0.25);
  });

  it('forwards setMarkerB and returns the engine result', () => {
    renderHook('file:///test.mp3');

    mockSetMarkerB.mockReturnValueOnce(true);
    let applied: boolean | undefined;
    act(() => {
      applied = lastResult.setMarkerB(10000);
    });
    expect(mockSetMarkerB).toHaveBeenCalledWith(10000);
    expect(applied).toBe(true);

    mockSetMarkerB.mockReturnValueOnce(false);
    act(() => {
      applied = lastResult.setMarkerB(1000);
    });
    expect(applied).toBe(false);
  });

  it('forwards setLoopEnabled to the engine', () => {
    renderHook('file:///test.mp3');

    act(() => {
      lastResult.setLoopEnabled(false);
    });

    expect(mockSetLoopEnabled).toHaveBeenCalledWith(false);
  });

  it('forwards the rolling-monitor controls to the engine', () => {
    renderHook('file:///test.mp3');

    act(() => {
      void lastResult.startMonitor(4200);
    });
    expect(mockStartMonitor).toHaveBeenCalledWith(4200);

    act(() => {
      lastResult.updateMonitor(4300);
    });
    expect(mockUpdateMonitor).toHaveBeenCalledWith(4300);

    act(() => {
      void lastResult.stopMonitor();
    });
    expect(mockStopMonitor).toHaveBeenCalled();
  });

  it('forwards commitMarkerPlacement to the engine', () => {
    renderHook('file:///test.mp3');

    act(() => {
      void lastResult.commitMarkerPlacement('B');
    });

    expect(mockCommitMarkerPlacement).toHaveBeenCalledWith('B');
  });

  it('reports the playhead as a shared value, not as state', () => {
    renderHook('file:///test.mp3');

    act(() => {
      publish({ ...IDLE_STATE, status: 'paused', positionMs: 7300 });
    });

    expect(lastResult.playheadMs.value).toBe(7300);
    // The position must not appear on the transport at all: a component that
    // reads the transport would then re-render ten times a second while
    // playing, which is the thing the split exists to prevent.
    expect(lastResult).not.toHaveProperty('positionMs');
  });

  it('does not re-render for a position that only moves the playhead', () => {
    renderHook('file:///test.mp3');
    const before = renders;

    act(() => {
      publish({ ...IDLE_STATE, status: 'paused', positionMs: 1000 });
    });
    act(() => {
      publish({ ...IDLE_STATE, status: 'paused', positionMs: 2000 });
    });

    expect(lastResult.playheadMs.value).toBe(2000);
    // One render for entering 'paused'; none at all for the second position.
    expect(renders - before).toBe(1);
  });

  it('re-renders when something on the transport actually changes', () => {
    renderHook('file:///test.mp3');
    const before = renders;

    act(() => {
      publish({ ...IDLE_STATE, markerA: 5000 });
    });

    expect(lastResult.markerA).toBe(5000);
    expect(renders).toBeGreaterThan(before);
  });

  it('exposes the engine snapshot for event-time reads', () => {
    renderHook('file:///test.mp3');

    act(() => {
      publish({ ...IDLE_STATE, positionMs: 8800 });
    });

    expect(lastResult.getPlaybackState().positionMs).toBe(8800);
  });
});

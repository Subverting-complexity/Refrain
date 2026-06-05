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
  volume: 1,
};

let subscriber: ((state: PlaybackState) => void) | null = null;
const mockLoadTrack = jest.fn<Promise<void>, [string]>();
const mockUnloadTrack = jest.fn<Promise<void>, []>();
const mockSetVolume = jest.fn<void, [number]>();
const mockLoadPersistedVolume = jest.fn<void, []>();

jest.mock('../../services/audioEngine', () => ({
  subscribe: (cb: (state: PlaybackState) => void) => {
    subscriber = cb;
    cb(IDLE_STATE);
    return () => {
      subscriber = null;
    };
  },
  loadTrack: (uri: string) => mockLoadTrack(uri),
  unloadTrack: () => mockUnloadTrack(),
  play: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(),
  seekTo: jest.fn(),
  setMarkerA: jest.fn(),
  setMarkerB: jest.fn(),
  clearMarkers: jest.fn(),
  setVolume: (v: number) => mockSetVolume(v),
  loadPersistedVolume: () => mockLoadPersistedVolume(),
}));

let lastResult: ReturnType<typeof useAudioPlayer>;

function TestComponent({ uri }: { uri: string | null }) {
  lastResult = useAudioPlayer(uri);
  return null;
}

function renderHook(uri: string | null): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent, { uri }));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  subscriber = null;
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

    expect(mockLoadTrack).toHaveBeenCalledWith('file:///test.mp3');
  });

  it('propagates the error status and lastError from the engine', () => {
    renderHook('file:///bad.mp3');

    act(() => {
      subscriber?.({
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

    expect(mockLoadTrack).toHaveBeenCalledWith('file:///bad.mp3');
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
      subscriber?.({ ...IDLE_STATE, volume: 0.4 });
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
});

/* eslint-disable @typescript-eslint/no-require-imports */

const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockSeekTo = jest.fn();
const mockRemove = jest.fn();
const mockSubscriptionRemove = jest.fn();
const mockVolumeSet = jest.fn<void, [number]>();
let statusCallback: ((status: unknown) => void) | null = null;

const mockAddListener = jest.fn(
  (_event: string, cb: (status: unknown) => void) => {
    statusCallback = cb;
    return { remove: mockSubscriptionRemove };
  },
);

const mockCreateAudioPlayer = jest.fn().mockImplementation(() => {
  const player: Record<string, unknown> = {
    play: mockPlay,
    pause: mockPause,
    seekTo: mockSeekTo,
    remove: mockRemove,
    addListener: mockAddListener,
  };
  Object.defineProperty(player, 'volume', {
    get: () => 1,
    set: (v: number) => mockVolumeSet(v),
    configurable: true,
  });
  return player;
});

const mockSetAudioModeAsync = jest.fn();

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
}));

const mockGetNumber = jest.fn<number, [string, number]>();
const mockSetNumber = jest.fn<void, [string, number]>();

jest.mock('../settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
}));

// expo-audio reports time in seconds; durations/positions below are in seconds.
function makeLoadedStatus(overrides: Record<string, unknown> = {}) {
  return {
    isLoaded: true,
    playing: false,
    isBuffering: false,
    currentTime: 0,
    duration: 60,
    didJustFinish: false,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  statusCallback = null;
  // seekTo returns a Promise; default it to resolve so callers that attach
  // `.catch` (e.g. the loop-rewind seek) work.
  mockSeekTo.mockResolvedValue(undefined);
  // Default: no persisted volume, so the engine uses its fallback.
  mockGetNumber.mockImplementation((_key, fallback) => fallback);
});

describe('audioEngine', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('loadTrack', () => {
    it('configures audio mode and creates a player', async () => {
      const { loadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3');

      expect(mockSetAudioModeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
        }),
      );
      expect(mockCreateAudioPlayer).toHaveBeenCalledWith(
        { uri: 'file:///test.mp3' },
        expect.objectContaining({ updateInterval: 100 }),
      );
    });

    it('unloads previous player before loading a new one', async () => {
      const { loadTrack } = require('../audioEngine');

      await loadTrack('file:///first.mp3');
      await loadTrack('file:///second.mp3');

      expect(mockRemove).toHaveBeenCalledTimes(1);
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
    });

    it('reports error status when createAudioPlayer throws', async () => {
      mockCreateAudioPlayer.mockImplementationOnce(() => {
        throw new Error('unsupported format');
      });
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      await loadTrack('file:///bad.mp3');

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall).toEqual(
        expect.objectContaining({
          status: 'error',
          positionMs: 0,
          lastError: 'unsupported format',
        }),
      );
    });

    it('notifies subscriber with loading status', async () => {
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      await loadTrack('file:///test.mp3');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'loading' }),
      );
    });

    it('clears markers when loading a new track', async () => {
      const { loadTrack, setMarkerA, subscribe } = require('../audioEngine');
      await loadTrack('file:///first.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      await loadTrack('file:///second.mp3');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markerA: null, markerB: null }),
      );
    });
  });

  describe('play', () => {
    it('plays the loaded player', async () => {
      const { loadTrack, play } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      await play();

      expect(mockPlay).toHaveBeenCalled();
    });

    it('does nothing when no player is loaded', async () => {
      const { play } = require('../audioEngine');

      await play();

      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('resets position to markerA when playing after track finished', async () => {
      const { loadTrack, play, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(10000);
      statusCallback?.(
        makeLoadedStatus({ didJustFinish: true, currentTime: 60 }),
      );
      await play();

      // markerA is 10000ms -> 10s at the expo-audio boundary.
      expect(mockSeekTo).toHaveBeenCalledWith(10);
      expect(mockPlay).toHaveBeenCalled();
    });

    it('resets position to 0 when playing after track finished with no markers', async () => {
      const { loadTrack, play } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(
        makeLoadedStatus({ didJustFinish: true, currentTime: 60 }),
      );
      await play();

      expect(mockSeekTo).toHaveBeenCalledWith(0);
      expect(mockPlay).toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('pauses the loaded player', async () => {
      const { loadTrack, pause } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      await pause();

      expect(mockPause).toHaveBeenCalled();
    });

    it('does nothing when no player is loaded', async () => {
      const { pause } = require('../audioEngine');

      await pause();

      expect(mockPause).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('pauses and resets position', async () => {
      const { loadTrack, stop } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      await stop();

      expect(mockPause).toHaveBeenCalled();
      expect(mockSeekTo).toHaveBeenCalledWith(0);
    });

    it('resets position to markerA when markers are set', async () => {
      const { loadTrack, stop, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      await stop();

      expect(mockPause).toHaveBeenCalled();
      // markerA 5000ms -> 5s.
      expect(mockSeekTo).toHaveBeenCalledWith(5);
    });

    it('does nothing when no player is loaded', async () => {
      const { stop } = require('../audioEngine');

      await stop();

      expect(mockPause).not.toHaveBeenCalled();
    });
  });

  describe('seekTo', () => {
    it('sets position on the player', async () => {
      const { loadTrack, seekTo } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      await seekTo(30000);

      // 30000ms -> 30s.
      expect(mockSeekTo).toHaveBeenCalledWith(30);
    });

    it('does nothing when no player is loaded', async () => {
      const { seekTo } = require('../audioEngine');

      await seekTo(30000);

      expect(mockSeekTo).not.toHaveBeenCalled();
    });
  });

  describe('unloadTrack', () => {
    it('removes the player and resets state', async () => {
      const { loadTrack, unloadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      subscribe(listener);
      listener.mockClear();

      await unloadTrack();

      expect(mockSubscriptionRemove).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'idle', positionMs: 0 }),
      );
    });

    it('clears markers on unload', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        unloadTrack,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(10000);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      await unloadTrack();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markerA: null, markerB: null }),
      );
    });
  });

  describe('subscribe', () => {
    it('calls listener immediately with current state', () => {
      const { subscribe } = require('../audioEngine');
      const listener = jest.fn();

      subscribe(listener);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'idle' }),
      );
    });

    it('returns an unsubscribe function that stops updates', async () => {
      const { subscribe, loadTrack } = require('../audioEngine');
      const listener = jest.fn();

      const unsubscribe = subscribe(listener);
      listener.mockClear();
      unsubscribe();

      await loadTrack('file:///test.mp3');

      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple concurrent listeners', async () => {
      const { subscribe, loadTrack } = require('../audioEngine');
      const listenerA = jest.fn();
      const listenerB = jest.fn();

      subscribe(listenerA);
      subscribe(listenerB);
      listenerA.mockClear();
      listenerB.mockClear();

      await loadTrack('file:///test.mp3');

      expect(listenerA).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'loading' }),
      );
      expect(listenerB).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'loading' }),
      );
    });

    it('unsubscribing one listener does not affect others', async () => {
      const { subscribe, loadTrack } = require('../audioEngine');
      const listenerA = jest.fn();
      const listenerB = jest.fn();

      const unsubA = subscribe(listenerA);
      subscribe(listenerB);
      listenerA.mockClear();
      listenerB.mockClear();

      unsubA();
      await loadTrack('file:///test.mp3');

      expect(listenerA).not.toHaveBeenCalled();
      expect(listenerB).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'loading' }),
      );
    });
  });

  describe('getState', () => {
    it('returns idle state initially', () => {
      const { getState } = require('../audioEngine');

      expect(getState()).toEqual({
        status: 'idle',
        positionMs: 0,
        durationMs: 0,
        markerA: null,
        markerB: null,
        volume: 1,
      });
    });
  });

  describe('volume', () => {
    it('defaults to full volume', () => {
      const { getVolume } = require('../audioEngine');
      expect(getVolume()).toBe(1);
    });

    it('seeds the loaded player with the current volume', async () => {
      const { loadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3');

      expect(mockVolumeSet).toHaveBeenCalledWith(1);
    });

    it('setVolume clamps, applies to the player, persists, and notifies', async () => {
      const { loadTrack, setVolume, subscribe } = require('../audioEngine');
      await loadTrack('file:///test.mp3');

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      setVolume(0.3);

      expect(mockVolumeSet).toHaveBeenCalledWith(0.3);
      expect(mockSetNumber).toHaveBeenCalledWith('playback.volume', 0.3);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ volume: 0.3 }),
      );
    });

    it('clamps out-of-range values to 0..1', () => {
      const { setVolume, getVolume } = require('../audioEngine');

      setVolume(5);
      expect(getVolume()).toBe(1);

      setVolume(-2);
      expect(getVolume()).toBe(0);
    });

    it('setVolume works with no player loaded and still persists', () => {
      const { setVolume, getVolume } = require('../audioEngine');

      setVolume(0.5);

      expect(getVolume()).toBe(0.5);
      expect(mockVolumeSet).not.toHaveBeenCalled();
      expect(mockSetNumber).toHaveBeenCalledWith('playback.volume', 0.5);
    });

    it('does not throw when persisting the volume fails', () => {
      mockSetNumber.mockImplementationOnce(() => {
        throw new Error('disk full');
      });
      const { setVolume, getVolume } = require('../audioEngine');

      expect(() => setVolume(0.7)).not.toThrow();
      expect(getVolume()).toBe(0.7);
    });

    it('does not surface an error when applying the volume throws', async () => {
      const { loadTrack, setVolume, subscribe } = require('../audioEngine');
      await loadTrack('file:///test.mp3');

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      // The next volume application (the property set) throws.
      mockVolumeSet.mockImplementationOnce(() => {
        throw new Error('volume failed');
      });

      expect(() => setVolume(0.2)).not.toThrow();

      expect(listener).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
      );
    });

    it('loadPersistedVolume hydrates from storage and notifies', () => {
      mockGetNumber.mockImplementation(() => 0.6);
      const {
        loadPersistedVolume,
        getVolume,
        subscribe,
      } = require('../audioEngine');

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      loadPersistedVolume();

      expect(mockGetNumber).toHaveBeenCalledWith('playback.volume', 1);
      expect(getVolume()).toBe(0.6);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ volume: 0.6 }),
      );
    });

    it('loadPersistedVolume falls back to default on storage error', () => {
      mockGetNumber.mockImplementation(() => {
        throw new Error('db error');
      });
      const { loadPersistedVolume, getVolume } = require('../audioEngine');

      expect(() => loadPersistedVolume()).not.toThrow();
      expect(getVolume()).toBe(1);
    });
  });

  describe('playback status updates', () => {
    it('reports playing status', async () => {
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      subscribe(listener);
      listener.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 5 }));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'playing',
          positionMs: 5000,
          durationMs: 60000,
        }),
      );
    });

    it('reports paused status when finished', async () => {
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      subscribe(listener);
      listener.mockClear();

      statusCallback?.(
        makeLoadedStatus({ didJustFinish: true, currentTime: 60 }),
      );

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'paused',
          positionMs: 60000,
          durationMs: 60000,
        }),
      );
    });

    it('reports error on playback error status', async () => {
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      subscribe(listener);
      listener.mockClear();

      statusCallback?.({ isLoaded: false, error: 'playback error' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          positionMs: 0,
          durationMs: 0,
          lastError: 'playback error',
        }),
      );
    });

    it('reports loading status when buffering', async () => {
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      subscribe(listener);
      listener.mockClear();

      statusCallback?.(makeLoadedStatus({ isBuffering: true }));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'loading' }),
      );
    });
  });

  describe('setMarkerA', () => {
    it('sets markerA and notifies listeners', async () => {
      const { loadTrack, setMarkerA, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      subscribe(listener);
      listener.mockClear();

      setMarkerA(5000);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markerA: 5000, markerB: null }),
      );
    });

    it('clears markerB when new A >= existing B', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(10000);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      setMarkerA(15000);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markerA: 15000, markerB: null }),
      );
    });
  });

  describe('setMarkerB', () => {
    it('sets markerB when A is set and B > A', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      const applied = setMarkerB(10000);

      expect(applied).toBe(true);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markerA: 5000, markerB: 10000 }),
      );
    });

    it('rejects markerB when <= markerA', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(10000);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      const applied = setMarkerB(5000);

      expect(applied).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });

    it('returns true when no A marker is set', async () => {
      const { loadTrack, setMarkerB, subscribe } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      const applied = setMarkerB(5000);

      expect(applied).toBe(true);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markerB: 5000 }),
      );
    });
  });

  describe('clearMarkers', () => {
    it('resets both markers to null', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        clearMarkers,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(10000);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      clearMarkers();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markerA: null, markerB: null }),
      );
    });
  });

  describe('loop-back behavior', () => {
    it('seeks to markerA when position reaches markerB during playback', async () => {
      const { loadTrack, setMarkerA, setMarkerB } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);
      mockSeekTo.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));

      // markerA 5000ms -> 5s.
      expect(mockSeekTo).toHaveBeenCalledWith(5);
    });

    it('seeks to markerA when position overshoots markerB', async () => {
      const { loadTrack, setMarkerA, setMarkerB } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);
      mockSeekTo.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15.05 }));

      expect(mockSeekTo).toHaveBeenCalledWith(5);
    });

    it('does not loop back when not playing', async () => {
      const { loadTrack, setMarkerA, setMarkerB } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);
      mockSeekTo.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: false, currentTime: 15 }));

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('does not loop back when only markerA is set', async () => {
      const { loadTrack, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      mockSeekTo.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 50 }));

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('publishes markerA as the position on loop rewind so the cursor jumps back', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      // Position overshoots marker B by the polling interval; the published
      // position must snap back to marker A, not stall at the overshoot.
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15.05 }));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'playing', positionMs: 5000 }),
      );
    });

    it('reports error without an unhandled rejection when the loop seek fails', async () => {
      mockSeekTo.mockRejectedValueOnce(new Error('seek failed'));
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));

      // Let the rejected seek promise settle.
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          lastError: 'seek failed',
        }),
      );
    });
  });
});

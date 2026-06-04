/* eslint-disable @typescript-eslint/no-require-imports */

const mockPlayAsync = jest.fn();
const mockPauseAsync = jest.fn();
const mockStopAsync = jest.fn();
const mockSetPositionAsync = jest.fn();
const mockSetVolumeAsync = jest.fn();
const mockUnloadAsync = jest.fn();
const mockSetOnPlaybackStatusUpdate = jest.fn();
let statusCallback: ((status: unknown) => void) | null = null;

const mockCreateAsync = jest.fn().mockImplementation((_source, _opts, cb) => {
  statusCallback = cb;
  return Promise.resolve({
    sound: {
      playAsync: mockPlayAsync,
      pauseAsync: mockPauseAsync,
      stopAsync: mockStopAsync,
      setPositionAsync: mockSetPositionAsync,
      setVolumeAsync: mockSetVolumeAsync,
      unloadAsync: mockUnloadAsync,
      setOnPlaybackStatusUpdate: mockSetOnPlaybackStatusUpdate,
    },
  });
});

const mockSetAudioModeAsync = jest.fn();

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: mockCreateAsync,
    },
    setAudioModeAsync: mockSetAudioModeAsync,
  },
}));

const mockGetNumber = jest.fn<number, [string, number]>();
const mockSetNumber = jest.fn<void, [string, number]>();

jest.mock('../settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
}));

function makeLoadedStatus(overrides: Record<string, unknown> = {}) {
  return {
    isLoaded: true,
    isPlaying: false,
    isBuffering: false,
    positionMillis: 0,
    durationMillis: 60000,
    didJustFinish: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  statusCallback = null;
  // setPositionAsync returns a Promise in expo-av; default it to resolve so
  // callers that attach `.catch` (e.g. the loop-rewind seek) work.
  mockSetPositionAsync.mockResolvedValue(undefined);
  mockSetVolumeAsync.mockResolvedValue(undefined);
  // Default: no persisted volume, so the engine uses its fallback.
  mockGetNumber.mockImplementation((_key, fallback) => fallback);
});

describe('audioEngine', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('loadTrack', () => {
    it('configures audio mode and creates a sound', async () => {
      const { loadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3');

      expect(mockSetAudioModeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        }),
      );
      expect(mockCreateAsync).toHaveBeenCalledWith(
        { uri: 'file:///test.mp3' },
        expect.objectContaining({ shouldPlay: false }),
        expect.any(Function),
      );
    });

    it('unloads previous sound before loading a new one', async () => {
      const { loadTrack } = require('../audioEngine');

      await loadTrack('file:///first.mp3');
      await loadTrack('file:///second.mp3');

      expect(mockUnloadAsync).toHaveBeenCalledTimes(1);
      expect(mockCreateAsync).toHaveBeenCalledTimes(2);
    });

    it('reports error status when createAsync throws', async () => {
      mockCreateAsync.mockRejectedValueOnce(new Error('unsupported format'));
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

    it('does not reject and reports error when unloading the previous sound throws', async () => {
      mockUnloadAsync.mockRejectedValueOnce(new Error('unload failed'));
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      // First load succeeds so a sound exists to be unloaded on the next load.
      await loadTrack('file:///first.mp3');
      subscribe(listener);
      listener.mockClear();

      await expect(loadTrack('file:///second.mp3')).resolves.toBeUndefined();

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall).toEqual(
        expect.objectContaining({
          status: 'error',
          lastError: 'unload failed',
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
    it('plays the loaded sound', async () => {
      const { loadTrack, play } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      await play();

      expect(mockPlayAsync).toHaveBeenCalled();
    });

    it('does nothing when no sound is loaded', async () => {
      const { play } = require('../audioEngine');

      await play();

      expect(mockPlayAsync).not.toHaveBeenCalled();
    });

    it('resets position to markerA when playing after track finished', async () => {
      const { loadTrack, play, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(10000);
      statusCallback?.(
        makeLoadedStatus({ didJustFinish: true, positionMillis: 60000 }),
      );
      await play();

      expect(mockSetPositionAsync).toHaveBeenCalledWith(10000);
      expect(mockPlayAsync).toHaveBeenCalled();
    });

    it('resets position to 0 when playing after track finished with no markers', async () => {
      const { loadTrack, play } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(
        makeLoadedStatus({ didJustFinish: true, positionMillis: 60000 }),
      );
      await play();

      expect(mockSetPositionAsync).toHaveBeenCalledWith(0);
      expect(mockPlayAsync).toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('pauses the loaded sound', async () => {
      const { loadTrack, pause } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      await pause();

      expect(mockPauseAsync).toHaveBeenCalled();
    });

    it('does nothing when no sound is loaded', async () => {
      const { pause } = require('../audioEngine');

      await pause();

      expect(mockPauseAsync).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('stops and resets position', async () => {
      const { loadTrack, stop } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      await stop();

      expect(mockStopAsync).toHaveBeenCalled();
      expect(mockSetPositionAsync).toHaveBeenCalledWith(0);
    });

    it('resets position to markerA when markers are set', async () => {
      const { loadTrack, stop, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      await stop();

      expect(mockStopAsync).toHaveBeenCalled();
      expect(mockSetPositionAsync).toHaveBeenCalledWith(5000);
    });

    it('does nothing when no sound is loaded', async () => {
      const { stop } = require('../audioEngine');

      await stop();

      expect(mockStopAsync).not.toHaveBeenCalled();
    });
  });

  describe('seekTo', () => {
    it('sets position on the sound', async () => {
      const { loadTrack, seekTo } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      await seekTo(30000);

      expect(mockSetPositionAsync).toHaveBeenCalledWith(30000);
    });

    it('does nothing when no sound is loaded', async () => {
      const { seekTo } = require('../audioEngine');

      await seekTo(30000);

      expect(mockSetPositionAsync).not.toHaveBeenCalled();
    });
  });

  describe('unloadTrack', () => {
    it('unloads and resets state', async () => {
      const { loadTrack, unloadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      subscribe(listener);
      listener.mockClear();

      await unloadTrack();

      expect(mockSetOnPlaybackStatusUpdate).toHaveBeenCalledWith(null);
      expect(mockUnloadAsync).toHaveBeenCalled();
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

    it('seeds the loaded sound with the current volume', async () => {
      const { loadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3');

      expect(mockCreateAsync).toHaveBeenCalledWith(
        { uri: 'file:///test.mp3' },
        expect.objectContaining({ volume: 1 }),
        expect.any(Function),
      );
    });

    it('setVolume clamps, applies to the sound, persists, and notifies', async () => {
      const { loadTrack, setVolume, subscribe } = require('../audioEngine');
      await loadTrack('file:///test.mp3');

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      setVolume(0.3);

      expect(mockSetVolumeAsync).toHaveBeenCalledWith(0.3);
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

    it('setVolume works with no sound loaded and still persists', () => {
      const { setVolume, getVolume } = require('../audioEngine');

      setVolume(0.5);

      expect(getVolume()).toBe(0.5);
      expect(mockSetVolumeAsync).not.toHaveBeenCalled();
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

    it('does not surface an error when the volume call rejects', async () => {
      mockSetVolumeAsync.mockRejectedValueOnce(new Error('volume failed'));
      const { loadTrack, setVolume, subscribe } = require('../audioEngine');
      await loadTrack('file:///test.mp3');

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      setVolume(0.2);
      await Promise.resolve();
      await Promise.resolve();

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

      statusCallback?.(
        makeLoadedStatus({ isPlaying: true, positionMillis: 5000 }),
      );

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
        makeLoadedStatus({ didJustFinish: true, positionMillis: 60000 }),
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

      setMarkerB(10000);

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

      setMarkerB(5000);

      expect(listener).not.toHaveBeenCalled();
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
      mockSetPositionAsync.mockClear();

      statusCallback?.(
        makeLoadedStatus({ isPlaying: true, positionMillis: 15000 }),
      );

      expect(mockSetPositionAsync).toHaveBeenCalledWith(5000);
    });

    it('seeks to markerA when position overshoots markerB', async () => {
      const { loadTrack, setMarkerA, setMarkerB } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);
      mockSetPositionAsync.mockClear();

      statusCallback?.(
        makeLoadedStatus({ isPlaying: true, positionMillis: 15050 }),
      );

      expect(mockSetPositionAsync).toHaveBeenCalledWith(5000);
    });

    it('does not loop back when not playing', async () => {
      const { loadTrack, setMarkerA, setMarkerB } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);
      mockSetPositionAsync.mockClear();

      statusCallback?.(
        makeLoadedStatus({ isPlaying: false, positionMillis: 15000 }),
      );

      expect(mockSetPositionAsync).not.toHaveBeenCalled();
    });

    it('does not loop back when only markerA is set', async () => {
      const { loadTrack, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      mockSetPositionAsync.mockClear();

      statusCallback?.(
        makeLoadedStatus({ isPlaying: true, positionMillis: 50000 }),
      );

      expect(mockSetPositionAsync).not.toHaveBeenCalled();
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
      statusCallback?.(
        makeLoadedStatus({ isPlaying: true, positionMillis: 15050 }),
      );

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'playing', positionMs: 5000 }),
      );
    });

    it('reports error without an unhandled rejection when the loop seek fails', async () => {
      mockSetPositionAsync.mockRejectedValueOnce(new Error('seek failed'));
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

      statusCallback?.(
        makeLoadedStatus({ isPlaying: true, positionMillis: 15000 }),
      );

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

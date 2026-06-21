/* eslint-disable @typescript-eslint/no-require-imports */

const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockSeekTo = jest.fn();
const mockRemove = jest.fn();
const mockSetActiveForLockScreen = jest.fn();
const mockClearLockScreenControls = jest.fn();
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
    setActiveForLockScreen: mockSetActiveForLockScreen,
    clearLockScreenControls: mockClearLockScreenControls,
  };
  Object.defineProperty(player, 'volume', {
    get: () => 1,
    set: (v: number) => mockVolumeSet(v),
    configurable: true,
  });
  return player;
});

const mockSetAudioModeAsync = jest.fn();
const mockSetIsAudioActiveAsync = jest.fn();

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
  setIsAudioActiveAsync: (...args: unknown[]) =>
    mockSetIsAudioActiveAsync(...args),
}));

const mockGetNumber = jest.fn<number, [string, number]>();
const mockSetNumber = jest.fn<void, [string, number]>();

jest.mock('../settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
}));

interface ActiveMarkersShape {
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
}

const mockGetActiveMarkers = jest.fn<ActiveMarkersShape | null, [string]>();
const mockSetActiveMarkers = jest.fn<void, [string, ActiveMarkersShape]>();

jest.mock('../markerStore', () => ({
  getActiveMarkers: (trackId: string) => mockGetActiveMarkers(trackId),
  setActiveMarkers: (trackId: string, markers: ActiveMarkersShape) =>
    mockSetActiveMarkers(trackId, markers),
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
  // Default: no saved markers, so loads start with empty markers.
  mockGetActiveMarkers.mockReturnValue(null);
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

    it('serializes concurrent loads so the previous player is always removed (no orphan)', async () => {
      const { loadTrack } = require('../audioEngine');

      // Fire two loads without awaiting the first: a back-then-tap or a
      // double-tapped track that stacks two player screens. Serialization must
      // make the second load fully unload the first, so exactly one player is
      // ever live — never two overlapping, un-stoppable players.
      await Promise.all([
        loadTrack('file:///first.mp3'),
        loadTrack('file:///second.mp3'),
      ]);

      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
      // The second load removed the first player; without serialization both
      // loads would have seen a null player and removed nothing (orphan).
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('registers the player for lock screen controls when a track name is provided', async () => {
      const { loadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3', undefined, 'My Song');

      expect(mockSetActiveForLockScreen).toHaveBeenCalledWith(
        true,
        { title: 'My Song', artist: 'Refrain' },
        { showSeekForward: false, showSeekBackward: false },
      );
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

    it('claims the audio session so other apps stop before playing', async () => {
      const { loadTrack, play } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      mockSetIsAudioActiveAsync.mockClear();

      await play();

      expect(mockSetIsAudioActiveAsync).toHaveBeenCalledWith(true);
      expect(mockPlay).toHaveBeenCalled();
    });

    it('plays even when claiming the audio session fails', async () => {
      mockSetIsAudioActiveAsync.mockRejectedValueOnce(
        new Error('focus denied'),
      );
      const { loadTrack, play } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());

      await expect(play()).resolves.toBeUndefined();
      expect(mockPlay).toHaveBeenCalled();
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

    it('starts from A when a region is set and the playhead is before A', async () => {
      const {
        loadTrack,
        play,
        setMarkerA,
        setMarkerB,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 2, duration: 60 }));
      setMarkerA(5000);
      setMarkerB(15000);
      mockSeekTo.mockClear();

      await play();

      expect(mockSeekTo).toHaveBeenCalledWith(5);
      expect(mockPlay).toHaveBeenCalled();
    });

    it('restarts from A when a region one-shot has stopped at B', async () => {
      const {
        loadTrack,
        play,
        setMarkerA,
        setMarkerB,
        setLoopEnabled,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));
      setMarkerA(5000);
      setMarkerB(15000);
      setLoopEnabled(false);
      // One-shot reaches B and pauses there.
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));
      mockSeekTo.mockClear();

      await play();

      expect(mockSeekTo).toHaveBeenCalledWith(5);
      expect(mockPlay).toHaveBeenCalled();
    });

    it('resumes in place when paused inside the region', async () => {
      const {
        loadTrack,
        play,
        setMarkerA,
        setMarkerB,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 8, duration: 60 }));
      setMarkerA(5000);
      setMarkerB(15000);
      mockSeekTo.mockClear();

      await play();

      // Playhead at 8s sits inside [5s, 15s], so no rewind — just resume.
      expect(mockSeekTo).not.toHaveBeenCalled();
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

    it('deactivates the audio session so other apps can resume', async () => {
      const { loadTrack, stop } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      mockSetIsAudioActiveAsync.mockClear();
      await stop();

      expect(mockSetIsAudioActiveAsync).toHaveBeenCalledWith(false);
    });

    it('resolves even when the player is released mid-stop', async () => {
      // stop() runs unserialized relative to load/unload, so a seek can hit a
      // just-removed player (tap Stop then navigate away). The rejection must
      // be swallowed, not surface as an unhandled rejection.
      const { loadTrack, stop } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      mockSeekTo.mockRejectedValueOnce(new Error('player released'));

      await expect(stop()).resolves.toBeUndefined();
    });

    it('resolves even when deactivating the audio session fails', async () => {
      const { loadTrack, stop } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      mockSetIsAudioActiveAsync.mockRejectedValueOnce(new Error('session'));

      await expect(stop()).resolves.toBeUndefined();
      expect(mockPause).toHaveBeenCalled();
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

    it('locks seeks inside the A/B window while looping', async () => {
      const {
        loadTrack,
        seekTo,
        setMarkerA,
        setMarkerB,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));
      setMarkerA(5000);
      setMarkerB(10000);

      // Past B clamps to B; before A clamps to A.
      await seekTo(30000);
      expect(mockSeekTo).toHaveBeenLastCalledWith(10);
      await seekTo(1000);
      expect(mockSeekTo).toHaveBeenLastCalledWith(5);
    });

    it('clamps seeks to the A/B region even when the loop is disabled', async () => {
      const {
        loadTrack,
        seekTo,
        setMarkerA,
        setMarkerB,
        setLoopEnabled,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));
      setMarkerA(5000);
      setMarkerB(10000);
      setLoopEnabled(false);

      // The region confines the playhead regardless of the loop toggle; the
      // toggle only decides whether reaching B rewinds or stops.
      await seekTo(30000);
      expect(mockSeekTo).toHaveBeenLastCalledWith(10);
    });

    it('does not clamp seeks when no region is set', async () => {
      const { loadTrack, seekTo } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));

      await seekTo(30000);
      expect(mockSeekTo).toHaveBeenLastCalledWith(30);
    });
  });

  describe('skipBy', () => {
    it('skips within the full track when no loop is armed', async () => {
      const { loadTrack, skipBy } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 30, duration: 60 }));

      await skipBy(5000);
      expect(mockSeekTo).toHaveBeenLastCalledWith(35);

      // Forward past the end clamps to the duration; back past 0 clamps to 0.
      await skipBy(40000);
      expect(mockSeekTo).toHaveBeenLastCalledWith(60);
      await skipBy(-40000);
      expect(mockSeekTo).toHaveBeenLastCalledWith(0);
    });

    it('skips within the A/B window while looping', async () => {
      const {
        loadTrack,
        skipBy,
        setMarkerA,
        setMarkerB,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 8, duration: 60 }));
      setMarkerA(5000);
      setMarkerB(10000);

      await skipBy(5000);
      expect(mockSeekTo).toHaveBeenLastCalledWith(10);
      await skipBy(-10000);
      expect(mockSeekTo).toHaveBeenLastCalledWith(5);
    });

    it('does nothing when no player is loaded', async () => {
      const { skipBy } = require('../audioEngine');

      await skipBy(5000);

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

    it('clears lock screen controls and releases audio focus', async () => {
      const { loadTrack, unloadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      mockSetIsAudioActiveAsync.mockClear();

      await unloadTrack();

      expect(mockClearLockScreenControls).toHaveBeenCalled();
      expect(mockSetIsAudioActiveAsync).toHaveBeenCalledWith(false);
    });

    it('pauses the player before removing it', async () => {
      const { loadTrack, unloadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      mockPause.mockClear();

      await unloadTrack();

      // Audio must be silenced explicitly, not left to remove() alone.
      expect(mockPause).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
    });

    it('still pauses and removes the player when releasing focus fails', async () => {
      mockSetIsAudioActiveAsync.mockRejectedValueOnce(
        new Error('session error'),
      );
      const { loadTrack, unloadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      mockPause.mockClear();
      mockRemove.mockClear();

      // A failing session-deactivate must not leave the player resident and
      // audible — the player is paused and removed regardless.
      await expect(unloadTrack()).resolves.toBeUndefined();
      expect(mockPause).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
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
        loopEnabled: true,
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

    it('reflects an OS interruption (playback paused mid-track) as paused', async () => {
      // expo-audio has no dedicated interruption event; a phone call or another
      // app grabbing audio focus surfaces as a playbackStatusUpdate with
      // playing:false mid-track. The engine must show that as paused (not keep
      // a stale "playing"), so the transport stays in sync with reality.
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      subscribe(listener);
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 5 }));
      listener.mockClear();

      // The OS interrupts: playback stops part-way through, not at the end.
      statusCallback?.(
        makeLoadedStatus({
          playing: false,
          currentTime: 5,
          didJustFinish: false,
        }),
      );

      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'paused', positionMs: 5000 }),
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

  describe('setLoopEnabled', () => {
    it('defaults loopEnabled to true', () => {
      const { getState } = require('../audioEngine');
      expect(getState().loopEnabled).toBe(true);
    });

    it('toggles loopEnabled and notifies without touching markers', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        setLoopEnabled,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(10000);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      setLoopEnabled(false);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          loopEnabled: false,
          markerA: 5000,
          markerB: 10000,
        }),
      );
    });

    it('resets loopEnabled to true when a new track loads', async () => {
      const { loadTrack, setLoopEnabled, getState } = require('../audioEngine');

      await loadTrack('file:///first.mp3');
      statusCallback?.(makeLoadedStatus());
      setLoopEnabled(false);
      expect(getState().loopEnabled).toBe(false);

      await loadTrack('file:///second.mp3');

      expect(getState().loopEnabled).toBe(true);
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

    it('stops at B (without rewinding) when looping is disabled', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        setLoopEnabled,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);
      setLoopEnabled(false);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();
      mockSeekTo.mockClear();
      mockPause.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));

      // One-shot: pause at B, no rewind to A.
      expect(mockSeekTo).not.toHaveBeenCalled();
      expect(mockPause).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paused', positionMs: 15000 }),
      );
    });

    it('resumes looping when re-enabled', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        setLoopEnabled,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);
      setLoopEnabled(false);
      setLoopEnabled(true);
      mockSeekTo.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));

      expect(mockSeekTo).toHaveBeenCalledWith(5);
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

    it('loops back when the track finishes naturally with B near the end', async () => {
      const { loadTrack, setMarkerA, setMarkerB } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(59900);
      mockSeekTo.mockClear();
      mockPlay.mockClear();

      statusCallback?.(
        makeLoadedStatus({
          playing: false,
          didJustFinish: true,
          currentTime: 60,
        }),
      );

      expect(mockSeekTo).toHaveBeenCalledWith(5);
      expect(mockPlay).toHaveBeenCalled();
    });

    it('publishes playing status when looping back on track finish', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(59900);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      statusCallback?.(
        makeLoadedStatus({
          playing: false,
          didJustFinish: true,
          currentTime: 60,
        }),
      );

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

  describe('setLoopRestartHandler', () => {
    it('pauses at A and invokes the handler instead of playing through', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        setLoopRestartHandler,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);

      const handler = jest.fn();
      setLoopRestartHandler(handler);

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();
      mockSeekTo.mockClear();
      mockPause.mockClear();
      mockPlay.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));

      // Rewinds to A, pauses there, and hands off — does not auto-resume.
      expect(mockSeekTo).toHaveBeenCalledWith(5);
      expect(mockPause).toHaveBeenCalled();
      expect(mockPlay).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paused', positionMs: 5000 }),
      );
    });

    it('loops seamlessly again once the handler is cleared', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        setLoopRestartHandler,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);

      const handler = jest.fn();
      setLoopRestartHandler(handler);
      setLoopRestartHandler(null);
      mockPause.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));

      expect(handler).not.toHaveBeenCalled();
      expect(mockSeekTo).toHaveBeenCalledWith(5);
      expect(mockPause).not.toHaveBeenCalled();
    });

    it('clears the handler on unload so it cannot leak into the next track', async () => {
      const {
        loadTrack,
        unloadTrack,
        setMarkerA,
        setMarkerB,
        setLoopRestartHandler,
      } = require('../audioEngine');

      // First track arms a per-loop count-in handler.
      await loadTrack('file:///first.mp3');
      statusCallback?.(makeLoadedStatus());
      const handler = jest.fn();
      setLoopRestartHandler(handler);

      // Unload, then load a fresh track that never registers a handler.
      await unloadTrack();
      await loadTrack('file:///second.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);
      mockPause.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));

      // The stale handler must not fire; the loop rewinds seamlessly instead.
      expect(handler).not.toHaveBeenCalled();
      expect(mockSeekTo).toHaveBeenCalledWith(5);
      expect(mockPause).not.toHaveBeenCalled();
    });
  });

  describe('rolling monitor', () => {
    it('seeks to the window start and plays on startMonitor', async () => {
      const { loadTrack, startMonitor } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 60 }));
      mockSeekTo.mockClear();
      mockPlay.mockClear();

      // Window [30s-2s, 30s+2s] = [28s, 32s] -> start at 28s.
      await startMonitor(30000);

      expect(mockSeekTo).toHaveBeenCalledWith(28);
      expect(mockPlay).toHaveBeenCalled();
    });

    it('does nothing when no player is loaded', async () => {
      const { startMonitor } = require('../audioEngine');

      await startMonitor(30000);

      expect(mockSeekTo).not.toHaveBeenCalled();
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('clamps the window to the track start', async () => {
      const { loadTrack, startMonitor } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));
      mockSeekTo.mockClear();

      // Center 1s would give [-1s, 3s]; the start clamps to 0.
      await startMonitor(1000);

      expect(mockSeekTo).toHaveBeenCalledWith(0);
    });

    it('clamps the window to the track end', async () => {
      const { loadTrack, startMonitor } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));
      mockSeekTo.mockClear();

      // Center 59s gives [57s, 61s]; the end clamps to the 60s duration, the
      // start stays at 57s.
      await startMonitor(59000);

      expect(mockSeekTo).toHaveBeenCalledWith(57);
    });

    it('loops within its window, rewinding to the window start at the end', async () => {
      const { loadTrack, startMonitor, subscribe } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 60 }));
      await startMonitor(30000); // window [28s, 32s]

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();
      mockSeekTo.mockClear();

      // Reaching the window end rewinds to the window start.
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 32 }));

      expect(mockSeekTo).toHaveBeenCalledWith(28);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'playing', positionMs: 28000 }),
      );
    });

    it('loops the window even when the A/B loop is disarmed', async () => {
      const {
        loadTrack,
        startMonitor,
        setLoopEnabled,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 60 }));
      setLoopEnabled(false);
      await startMonitor(30000); // window [28s, 32s]
      mockSeekTo.mockClear();
      mockPause.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 32 }));

      // Monitor rewinds rather than one-shot stopping at the window end.
      expect(mockSeekTo).toHaveBeenCalledWith(28);
      expect(mockPause).not.toHaveBeenCalled();
    });

    it('ignores the per-loop count-in handler while monitoring', async () => {
      const {
        loadTrack,
        startMonitor,
        setLoopRestartHandler,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 60 }));
      const handler = jest.fn();
      setLoopRestartHandler(handler);
      await startMonitor(30000); // window [28s, 32s]
      mockSeekTo.mockClear();
      mockPause.mockClear();

      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 32 }));

      expect(handler).not.toHaveBeenCalled();
      expect(mockPause).not.toHaveBeenCalled();
      expect(mockSeekTo).toHaveBeenCalledWith(28);
    });

    it('follows the marker by re-seeking when the playhead leaves the window', async () => {
      const {
        loadTrack,
        startMonitor,
        updateMonitor,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 60 }));
      await startMonitor(30000); // window [28s, 32s]
      // Playhead advances to 30s inside the window.
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 30 }));
      mockSeekTo.mockClear();

      // New center 50s -> window [48s, 52s]; the 30s playhead is now outside,
      // so it re-seeks to the new window start.
      updateMonitor(50000);

      expect(mockSeekTo).toHaveBeenCalledWith(48);
    });

    it('does not re-seek when a small move keeps the playhead in the window', async () => {
      const {
        loadTrack,
        startMonitor,
        updateMonitor,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 60 }));
      await startMonitor(30000); // window [28s, 32s]
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 30 }));
      mockSeekTo.mockClear();

      // New center 31s -> window [29s, 33s]; the 30s playhead is still inside.
      updateMonitor(31000);

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('updateMonitor is a no-op when the monitor is not running', async () => {
      const { loadTrack, updateMonitor } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 60 }));
      mockSeekTo.mockClear();

      updateMonitor(50000);

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('restores the playhead and resumes when playback was running', async () => {
      const {
        loadTrack,
        startMonitor,
        stopMonitor,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 20 }));
      await startMonitor(40000);
      mockSeekTo.mockClear();
      mockPlay.mockClear();
      mockPause.mockClear();

      await stopMonitor();

      // Restores the captured 20s playhead and resumes playback.
      expect(mockSeekTo).toHaveBeenCalledWith(20);
      expect(mockPlay).toHaveBeenCalled();
      expect(mockPause).not.toHaveBeenCalled();
    });

    it('restores the playhead and stays paused when playback was paused', async () => {
      const {
        loadTrack,
        startMonitor,
        stopMonitor,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: false, currentTime: 20 }));
      await startMonitor(40000);
      mockSeekTo.mockClear();
      mockPlay.mockClear();
      mockPause.mockClear();

      await stopMonitor();

      expect(mockSeekTo).toHaveBeenCalledWith(20);
      expect(mockPause).toHaveBeenCalled();
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('stopMonitor is a no-op when the monitor is not running', async () => {
      const { loadTrack, stopMonitor } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 20, duration: 60 }));
      mockSeekTo.mockClear();
      mockPause.mockClear();

      await stopMonitor();

      expect(mockSeekTo).not.toHaveBeenCalled();
      expect(mockPause).not.toHaveBeenCalled();
    });

    it('keeps the captured transport when startMonitor is called again', async () => {
      const {
        loadTrack,
        startMonitor,
        stopMonitor,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 20 }));
      await startMonitor(40000); // captures the 20s / playing transport

      // The monitor moves on; a second start must not overwrite the capture.
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 38 }));
      await startMonitor(50000);
      mockSeekTo.mockClear();

      await stopMonitor();

      // Restores the original 20s capture, not the later 38s position.
      expect(mockSeekTo).toHaveBeenCalledWith(20);
    });

    it('does not mutate the markers or loop flag', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        setLoopEnabled,
        startMonitor,
        updateMonitor,
        stopMonitor,
        getState,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 60 }));
      setMarkerA(5000);
      setMarkerB(15000);
      setLoopEnabled(false);

      await startMonitor(40000);
      updateMonitor(45000);
      await stopMonitor();

      const state = getState();
      expect(state.markerA).toBe(5000);
      expect(state.markerB).toBe(15000);
      expect(state.loopEnabled).toBe(false);
    });

    it('tears down an active monitor on unload', async () => {
      const {
        loadTrack,
        startMonitor,
        updateMonitor,
        unloadTrack,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 60 }));
      await startMonitor(30000);

      await unloadTrack();
      mockSeekTo.mockClear();

      // The monitor is gone, so a stray follow update does nothing.
      updateMonitor(50000);

      expect(mockSeekTo).not.toHaveBeenCalled();
    });
  });

  describe('marker persistence', () => {
    // Must match MARKER_SAVE_DEBOUNCE_MS in audioEngine.ts.
    const SAVE_DEBOUNCE_MS = 300;

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('persists the marker set once the debounce window elapses', async () => {
      const { loadTrack, setMarkerA, setMarkerB } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);

      // Nothing written until the debounce window passes.
      expect(mockSetActiveMarkers).not.toHaveBeenCalled();

      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);

      expect(mockSetActiveMarkers).toHaveBeenCalledTimes(1);
      expect(mockSetActiveMarkers).toHaveBeenLastCalledWith('track-1', {
        markerA: 5000,
        markerB: 15000,
        loopEnabled: true,
      });
    });

    it('persists a loop-enabled toggle for the track', async () => {
      const { loadTrack, setLoopEnabled } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');
      statusCallback?.(makeLoadedStatus());
      setLoopEnabled(false);

      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);

      expect(mockSetActiveMarkers).toHaveBeenLastCalledWith(
        'track-1',
        expect.objectContaining({ loopEnabled: false }),
      );
    });

    it('coalesces a burst of changes into one write with the final value', async () => {
      const { loadTrack, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');
      statusCallback?.(makeLoadedStatus());

      // Three changes inside the window; each resets the debounce timer.
      setMarkerA(1000);
      jest.advanceTimersByTime(100);
      setMarkerA(2000);
      jest.advanceTimersByTime(100);
      setMarkerA(3000);

      expect(mockSetActiveMarkers).not.toHaveBeenCalled();

      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);

      // The final value wins; the debounce never drops it.
      expect(mockSetActiveMarkers).toHaveBeenCalledTimes(1);
      expect(mockSetActiveMarkers).toHaveBeenLastCalledWith(
        'track-1',
        expect.objectContaining({ markerA: 3000 }),
      );
    });

    it('does not persist when the track is loaded without an id', async () => {
      const { loadTrack, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);

      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);

      expect(mockSetActiveMarkers).not.toHaveBeenCalled();
    });

    it('flushes a pending marker save when the track unloads', async () => {
      const { loadTrack, setMarkerA, unloadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(8000);
      // Navigate away before the debounce fires.
      await unloadTrack();

      expect(mockSetActiveMarkers).toHaveBeenCalledTimes(1);
      expect(mockSetActiveMarkers).toHaveBeenLastCalledWith('track-1', {
        markerA: 8000,
        markerB: null,
        loopEnabled: true,
      });
    });

    it('does not persist the empty-marker reset performed on unload', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        unloadTrack,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      setMarkerB(15000);
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS); // committed
      mockSetActiveMarkers.mockClear();

      await unloadTrack();

      // No change was pending, so the reset to empty markers is not written —
      // the saved set survives.
      expect(mockSetActiveMarkers).not.toHaveBeenCalled();
    });

    it('restores saved markers on load, overriding the empty defaults', async () => {
      mockGetActiveMarkers.mockReturnValue({
        markerA: 2000,
        markerB: 8000,
        loopEnabled: true,
      });
      const { loadTrack, getState } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');

      expect(mockGetActiveMarkers).toHaveBeenCalledWith('track-1');
      const state = getState();
      expect(state.markerA).toBe(2000);
      expect(state.markerB).toBe(8000);
    });

    it('leaves markers empty when the track has no saved set', async () => {
      mockGetActiveMarkers.mockReturnValue(null);
      const { loadTrack, getState } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');

      const state = getState();
      expect(state.markerA).toBeNull();
      expect(state.markerB).toBeNull();
    });

    it('applies a restored loopEnabled that differs from the default', async () => {
      mockGetActiveMarkers.mockReturnValue({
        markerA: 2000,
        markerB: 8000,
        loopEnabled: false,
      });
      const { loadTrack, getState } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');

      // The post-load default is true; the saved false must win.
      expect(getState().loopEnabled).toBe(false);
    });

    it('notifies subscribers with the restored markers', async () => {
      mockGetActiveMarkers.mockReturnValue({
        markerA: 2000,
        markerB: 8000,
        loopEnabled: true,
      });
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      await loadTrack('file:///test.mp3', 'track-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markerA: 2000, markerB: 8000 }),
      );
    });

    it('does not re-persist markers that were just restored', async () => {
      mockGetActiveMarkers.mockReturnValue({
        markerA: 2000,
        markerB: 8000,
        loopEnabled: false,
      });
      const { loadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);

      expect(mockSetActiveMarkers).not.toHaveBeenCalled();
    });
  });
});

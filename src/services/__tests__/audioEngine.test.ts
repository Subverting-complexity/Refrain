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
const mockGetSetting = jest.fn<string | null, [string]>();
const mockSetSetting = jest.fn<void, [string, string]>();
const mockHydrateSettings = jest.fn<Promise<void>, []>();

jest.mock('../settingsStore', () => ({
  getNumber: (key: string, fallback: number) => mockGetNumber(key, fallback),
  setNumber: (key: string, value: number) => mockSetNumber(key, value),
  getSetting: (key: string) => mockGetSetting(key),
  setSetting: (key: string, value: string) => mockSetSetting(key, value),
  hydrateSettings: () => mockHydrateSettings(),
}));

/** Point the persisted skip preference at a given mode/amount for one test. */
function setStoredSkip(preference: {
  mode?: 'interval' | 'full';
  seconds?: number;
}) {
  mockGetSetting.mockImplementation((key) =>
    key === 'playback.skipMode' ? (preference.mode ?? 'interval') : null,
  );
  mockGetNumber.mockImplementation((key, fallback) =>
    key === 'playback.skipSeconds'
      ? (preference.seconds ?? fallback)
      : fallback,
  );
}

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

/**
 * Let a loop rewind settle. The engine restarts a naturally finished track
 * only once its rewind seek has landed (a player parked at the end of its item
 * ignores play), so the restart is a microtask behind the status update that
 * triggered it.
 */
async function flushRewind() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  statusCallback = null;
  // seekTo returns a Promise; default it to resolve so callers that attach
  // `.catch` (e.g. the loop-rewind seek) work.
  mockSeekTo.mockResolvedValue(undefined);
  // Default: no persisted volume, so the engine uses its fallback.
  mockGetNumber.mockImplementation((_key, fallback) => fallback);
  // Default: no stored skip mode, so the engine reads the default 5s interval.
  mockGetSetting.mockReturnValue(null);
  // Default: hydration resolves immediately (warm cache / native no-op).
  mockHydrateSettings.mockResolvedValue(undefined);
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
        { showSeekForward: true, showSeekBackward: true },
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

  // Markers are restored without knowing the new track's length, so a track
  // re-imported from a shorter file (or a corrected duration) can leave B
  // past the end. The playhead could then never reach B: the loop never
  // rewound, and play() started at the very end, which finished immediately
  // — a Play button that did nothing, with nothing explaining why.
  describe('a saved marker B past the end of the track', () => {
    async function loadWithMarkersPastEnd() {
      mockGetActiveMarkers.mockReturnValue({
        markerA: 5_000,
        markerB: 90_000, // the track below is only 60s
        loopEnabled: true,
      });
      const engine = require('../audioEngine');
      await engine.loadTrack('file:///test.mp3', 'track-1');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));
      return engine;
    }

    it('rewinds at the end of the track rather than never looping', async () => {
      const { subscribe } = await loadWithMarkersPastEnd();
      const listener = jest.fn();
      subscribe(listener);
      mockSeekTo.mockClear();

      // Playing, and the playhead has reached the end of the real audio.
      statusCallback?.(
        makeLoadedStatus({ duration: 60, currentTime: 60, playing: true }),
      );

      expect(mockSeekTo).toHaveBeenCalledWith(5);
    });

    // The harder case: A is past the end too, so there is no usable region at
    // all. The whole-track loop must not be handed an inverted region
    // ({ a: 100s, b: 60s }) — the playhead is always past `b`, so every status
    // update would rewind to a point beyond the end, finish immediately and
    // rewind again, spinning at the update rate while reporting a position
    // past the end of the track.
    it('falls back to the whole track when marker A is past the end too', async () => {
      mockGetActiveMarkers.mockReturnValue({
        markerA: 100_000,
        markerB: 120_000,
        loopEnabled: true,
      });
      const { loadTrack, subscribe } = require('../audioEngine');
      await loadTrack('file:///test.mp3', 'track-1');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();
      mockSeekTo.mockClear();

      statusCallback?.(
        makeLoadedStatus({ duration: 60, currentTime: 60, playing: true }),
      );

      // Rewinds to the start of the track, not to an unreachable marker.
      expect(mockSeekTo).toHaveBeenCalledWith(0);
      // And never publishes a position beyond the track.
      for (const [state] of listener.mock.calls) {
        expect(state.positionMs).toBeLessThanOrEqual(60_000);
      }
    });

    it('restarts from marker A instead of stalling at the end', async () => {
      const { play } = await loadWithMarkersPastEnd();
      statusCallback?.(
        makeLoadedStatus({ duration: 60, currentTime: 60, playing: false }),
      );
      mockSeekTo.mockClear();

      await play();

      expect(mockSeekTo).toHaveBeenCalledWith(5);
      expect(mockPlay).toHaveBeenCalled();
    });
  });

  describe('the rolling monitor', () => {
    async function loadPlaying() {
      const engine = require('../audioEngine');
      await engine.loadTrack('file:///test.mp3', 'track-1');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));
      return engine;
    }

    // The active flag is committed before the seek that can reject. Left set,
    // the monitor window would outrank the A/B region for the rest of the
    // track's life, silently replacing the reader's loop with a four-second
    // window.
    it('does not stay in preview mode when its seek fails', async () => {
      const { startMonitor, setMarkerA, setMarkerB, stopMonitor } =
        await loadPlaying();
      setMarkerA(1_000);
      setMarkerB(50_000);

      mockSeekTo.mockRejectedValueOnce(new Error('seek failed'));
      await expect(startMonitor(20_000)).rejects.toThrow('seek failed');

      // Not monitoring: stopMonitor has nothing to restore, so it issues no
      // seek of its own.
      mockSeekTo.mockClear();
      await stopMonitor();
      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    // Between clearing the monitor and the restore seek landing, the playhead
    // is still inside the old preview window. If that window sat at or past
    // marker B, the loop would fire its own rewind and steal the playhead the
    // restore was putting back.
    it('does not let the loop steal the playhead during the restore', async () => {
      const { startMonitor, stopMonitor, setMarkerA, setMarkerB, seekTo } =
        await loadPlaying();
      setMarkerA(1_000);
      setMarkerB(30_000);

      // Park at 20s, playing, then preview around marker B.
      await seekTo(20_000);
      statusCallback?.(
        makeLoadedStatus({ duration: 60, currentTime: 20, playing: true }),
      );
      await startMonitor(30_000);

      // Hold the restore seek open, and let a status tick past B arrive while
      // it is still in flight.
      let releaseSeek: () => void = () => undefined;
      mockSeekTo.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseSeek = resolve;
          }),
      );
      const stopping = stopMonitor();
      mockSeekTo.mockClear();
      statusCallback?.(
        makeLoadedStatus({ duration: 60, currentTime: 31, playing: true }),
      );

      // The loop must not have issued a rewind of its own.
      expect(mockSeekTo).not.toHaveBeenCalled();
      releaseSeek();
      await stopping;
    });
  });

  describe('a background seek that fails after teardown', () => {
    // subscribe() replays currentState to every new subscriber, so an error
    // stamped onto the idle state after unload would greet the next track.
    it('does not report an error against a player that is gone', async () => {
      const {
        loadTrack,
        unloadTrack,
        subscribe,
        setMarkerA,
        setMarkerB,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3', 'track-1');
      statusCallback?.(makeLoadedStatus({ duration: 60 }));
      setMarkerA(1_000);
      setMarkerB(30_000);

      // The loop rewind's seek rejects, but only after the track is unloaded.
      let rejectSeek: (err: Error) => void = () => undefined;
      mockSeekTo.mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectSeek = reject;
          }),
      );
      statusCallback?.(
        makeLoadedStatus({ duration: 60, currentTime: 30, playing: true }),
      );

      await unloadTrack();
      rejectSeek(new Error('player released'));
      await Promise.resolve();
      await Promise.resolve();

      const listener = jest.fn();
      subscribe(listener);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'idle' }),
      );
    });
  });

  describe('a load that fails partway', () => {
    // The player is created before the lock-screen registration; a throw in
    // between left it unreachable — `player` was never assigned, so unload
    // could not release it and every retry stranded another native player.
    it('releases a player created before the failure', async () => {
      const { loadTrack } = require('../audioEngine');

      mockSetActiveForLockScreen.mockImplementationOnce(() => {
        throw new Error('media session unavailable');
      });

      await loadTrack('file:///test.mp3');

      expect(mockCreateAudioPlayer).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
    });

    it('reports the failure as an error state', async () => {
      const { loadTrack, getState } = require('../audioEngine');

      mockSetActiveForLockScreen.mockImplementationOnce(() => {
        throw new Error('media session unavailable');
      });

      await loadTrack('file:///test.mp3');

      expect(getState().status).toBe('error');
    });

    // The id is claimed before the load can fail. Left set, a later marker
    // edit would schedule a save against a track that never loaded.
    it('does not persist markers against a track that never loaded', async () => {
      jest.useFakeTimers();
      try {
        const { loadTrack, setMarkerA } = require('../audioEngine');

        mockSetActiveForLockScreen.mockImplementationOnce(() => {
          throw new Error('media session unavailable');
        });

        await loadTrack('file:///test.mp3', 'track-1');
        mockSetActiveMarkers.mockClear();
        setMarkerA(1000);
        jest.advanceTimersByTime(1000);

        expect(mockSetActiveMarkers).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
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

    // play() is deliberately outside the lifecycle queue, so a teardown can
    // land during the awaits it makes. Before this was guarded, the trailing
    // player.play() ran against a released (or replaced) player.
    it('does not play when the track is unloaded mid-await', async () => {
      const { loadTrack, play, unloadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      mockPlay.mockClear();

      // Unload while play() is parked on the audio-session claim.
      let releaseSession: () => void = () => undefined;
      mockSetIsAudioActiveAsync.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseSession = resolve;
          }),
      );

      const playing = play();
      await unloadTrack();
      releaseSession();
      await playing;

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
      const {
        loadTrack,
        play,
        setMarkerA,
        setLoopEnabled,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(10000);
      // Disarm the loop so the finish parks at the end (an armed loop would
      // rewind on its own); this exercises play()'s own restart path.
      setLoopEnabled(false);
      statusCallback?.(
        makeLoadedStatus({ didJustFinish: true, currentTime: 60 }),
      );
      mockSeekTo.mockClear();
      await play();

      // markerA is 10000ms -> 10s at the expo-audio boundary.
      expect(mockSeekTo).toHaveBeenCalledWith(10);
      expect(mockPlay).toHaveBeenCalled();
    });

    it('resets position to 0 when playing after track finished with no markers', async () => {
      const { loadTrack, play, setLoopEnabled } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      setLoopEnabled(false);
      statusCallback?.(
        makeLoadedStatus({ didJustFinish: true, currentTime: 60 }),
      );
      mockSeekTo.mockClear();
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

  describe('skipBack / skipForward', () => {
    it('skips by the configured interval within the full track', async () => {
      setStoredSkip({ seconds: 15 });
      const { loadTrack, skipBack, skipForward } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 30, duration: 60 }));

      await skipForward();
      expect(mockSeekTo).toHaveBeenLastCalledWith(45);
      await skipBack();
      expect(mockSeekTo).toHaveBeenLastCalledWith(15);
    });

    it('honours a minute-scale interval', async () => {
      setStoredSkip({ seconds: 60 });
      const { loadTrack, skipForward } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 30, duration: 300 }));

      await skipForward();
      expect(mockSeekTo).toHaveBeenLastCalledWith(90);
    });

    it('clamps to the track ends', async () => {
      setStoredSkip({ seconds: 300 });
      const { loadTrack, skipBack, skipForward } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 30, duration: 60 }));

      await skipForward();
      expect(mockSeekTo).toHaveBeenLastCalledWith(60);
      await skipBack();
      expect(mockSeekTo).toHaveBeenLastCalledWith(0);
    });

    it('skips within the A/B window while looping', async () => {
      setStoredSkip({ seconds: 5 });
      const {
        loadTrack,
        skipBack,
        skipForward,
        setMarkerA,
        setMarkerB,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 8, duration: 60 }));
      setMarkerA(5000);
      setMarkerB(10000);

      await skipForward();
      expect(mockSeekTo).toHaveBeenLastCalledWith(10);
      await skipBack();
      expect(mockSeekTo).toHaveBeenLastCalledWith(5);
    });

    it('runs to the track ends in full mode', async () => {
      setStoredSkip({ mode: 'full' });
      const { loadTrack, skipBack, skipForward } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 30, duration: 60 }));

      await skipForward();
      expect(mockSeekTo).toHaveBeenLastCalledWith(60);
      await skipBack();
      expect(mockSeekTo).toHaveBeenLastCalledWith(0);
    });

    it('runs to the region edges in full mode with markers set', async () => {
      setStoredSkip({ mode: 'full' });
      const {
        loadTrack,
        skipBack,
        skipForward,
        setMarkerA,
        setMarkerB,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 8, duration: 60 }));
      setMarkerA(5000);
      setMarkerB(10000);

      await skipForward();
      expect(mockSeekTo).toHaveBeenLastCalledWith(10);
      await skipBack();
      expect(mockSeekTo).toHaveBeenLastCalledWith(5);
    });

    // A failed settings read must not leave the transport buttons inert.
    it('falls back to the default interval when the store throws', async () => {
      const { loadTrack, skipForward } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 30, duration: 60 }));
      mockGetSetting.mockImplementation(() => {
        throw new Error('db unavailable');
      });

      await skipForward();
      expect(mockSeekTo).toHaveBeenLastCalledWith(35);
    });

    it('does nothing when no player is loaded', async () => {
      const { skipForward } = require('../audioEngine');

      await skipForward();

      expect(mockSeekTo).not.toHaveBeenCalled();
    });
  });

  // expo-audio performs the lock-screen seek itself, with a hardcoded 10s
  // interval and no JS callback, so a press arrives only as an unexplained
  // jump in the status stream. These cover the engine spotting that jump and
  // redirecting it to the configured skip.
  describe('lock-screen skip interception', () => {
    /** Load a track and settle the playhead at `currentTime` seconds. */
    async function loadAt(currentTime: number, duration = 300) {
      const engine = require('../audioEngine');
      await engine.loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime, duration }));
      mockSeekTo.mockClear();
      return engine;
    }

    /** The native lock-screen seek: a bare ±10s jump we never asked for. */
    function nativeSkip(fromSeconds: number, direction: 1 | -1) {
      statusCallback?.(
        makeLoadedStatus({
          currentTime: fromSeconds + direction * 10,
          duration: 300,
          playing: true,
        }),
      );
    }

    it('rewrites a forward press to the configured interval', async () => {
      setStoredSkip({ seconds: 30 });
      await loadAt(60);

      nativeSkip(60, 1);

      expect(mockSeekTo).toHaveBeenCalledWith(90);
    });

    it('rewrites a backward press to the configured interval', async () => {
      setStoredSkip({ seconds: 30 });
      await loadAt(60);

      nativeSkip(60, -1);

      expect(mockSeekTo).toHaveBeenCalledWith(30);
    });

    it('honours a minute-scale interval', async () => {
      setStoredSkip({ seconds: 300 });
      await loadAt(60, 3600);

      statusCallback?.(
        makeLoadedStatus({ currentTime: 70, duration: 3600, playing: true }),
      );

      expect(mockSeekTo).toHaveBeenCalledWith(360);
    });

    it('runs to the region edge in full mode', async () => {
      setStoredSkip({ mode: 'full' });
      const engine = await loadAt(60);
      engine.setMarkerA(50000);
      engine.setMarkerB(200000);
      mockSeekTo.mockClear();

      nativeSkip(60, 1);

      expect(mockSeekTo).toHaveBeenCalledWith(200);
    });

    // The native seek knows nothing about A/B, so without the clamp a
    // lock-screen press would walk the playhead straight out of the loop.
    it('clamps a forward press to the end of the A/B region', async () => {
      setStoredSkip({ seconds: 30 });
      const engine = await loadAt(60);
      engine.setMarkerA(50000);
      engine.setMarkerB(65000);
      mockSeekTo.mockClear();

      nativeSkip(60, 1);

      expect(mockSeekTo).toHaveBeenCalledWith(65);
    });

    it('clamps a backward press to the start of the A/B region', async () => {
      setStoredSkip({ seconds: 30 });
      const engine = await loadAt(60);
      engine.setMarkerA(55000);
      engine.setMarkerB(200000);
      mockSeekTo.mockClear();

      nativeSkip(60, -1);

      expect(mockSeekTo).toHaveBeenCalledWith(55);
    });

    it('publishes the corrected position rather than the native landing spot', async () => {
      setStoredSkip({ seconds: 30 });
      const engine = await loadAt(60);
      const listener = jest.fn();
      engine.subscribe(listener);
      listener.mockClear();

      nativeSkip(60, 1);

      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ positionMs: 90000 }),
      );
    });

    // With a 10s preference the native interval is already right; re-seeking
    // would be a pointless second seek on every press.
    it('leaves a press alone when the interval already matches', async () => {
      setStoredSkip({ seconds: 10 });
      await loadAt(60);

      nativeSkip(60, 1);

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('ignores ordinary playback advance', async () => {
      setStoredSkip({ seconds: 30 });
      await loadAt(60);

      statusCallback?.(
        makeLoadedStatus({ currentTime: 60.1, duration: 300, playing: true }),
      );

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    // Our own seeks land as jumps too. A 10s in-app skip must not be read as a
    // lock-screen press and then re-applied.
    it('ignores the landing of a seek we issued ourselves', async () => {
      setStoredSkip({ seconds: 10 });
      const engine = await loadAt(60);

      await engine.skipForward();
      expect(mockSeekTo).toHaveBeenLastCalledWith(70);
      mockSeekTo.mockClear();

      statusCallback?.(
        makeLoadedStatus({ currentTime: 70, duration: 300, playing: true }),
      );

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('ignores a seek we issued even when the preference differs', async () => {
      setStoredSkip({ seconds: 30 });
      const engine = await loadAt(60);

      await engine.seekTo(70000);
      mockSeekTo.mockClear();

      statusCallback?.(
        makeLoadedStatus({ currentTime: 70, duration: 300, playing: true }),
      );

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    // A marker drag re-seeks continuously to follow the marker; those jumps
    // are the preview working, not the lock screen.
    it('ignores jumps while the monitor is previewing', async () => {
      setStoredSkip({ seconds: 30 });
      const engine = await loadAt(60);
      // Preview window [198s, 202s].
      await engine.startMonitor(200000);
      // Settle inside the window, then jump backwards by the native interval.
      // Backwards, so the movement can't also trip the monitor's own rewind.
      statusCallback?.(
        makeLoadedStatus({ currentTime: 199, duration: 300, playing: true }),
      );
      mockSeekTo.mockClear();

      statusCallback?.(
        makeLoadedStatus({ currentTime: 189, duration: 300, playing: true }),
      );

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('does not read the first update of a track as a jump', async () => {
      setStoredSkip({ seconds: 30 });
      const { loadTrack } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      mockSeekTo.mockClear();
      statusCallback?.(makeLoadedStatus({ currentTime: 10, duration: 300 }));

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    // Reaching the end auto-pauses at the duration, which can look like a jump.
    // Markers well short of the end make the difference observable: read as a
    // press, the correction would drag the playhead back to marker B.
    it('does not read a natural end as a press', async () => {
      setStoredSkip({ seconds: 30 });
      const engine = await loadAt(290);
      engine.setMarkerA(50000);
      engine.setMarkerB(200000);
      engine.setLoopEnabled(false);
      mockSeekTo.mockClear();

      statusCallback?.(
        makeLoadedStatus({
          currentTime: 300,
          duration: 300,
          didJustFinish: true,
        }),
      );

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('surfaces a failed corrective seek as an error', async () => {
      setStoredSkip({ seconds: 30 });
      const engine = await loadAt(60);
      const listener = jest.fn();
      engine.subscribe(listener);
      mockSeekTo.mockRejectedValueOnce(new Error('seek failed'));

      nativeSkip(60, 1);
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'error',
          lastError: 'seek failed',
        }),
      );
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

    it('a listener that throws on its initial replay does not fail subscribe', () => {
      // subscribe() replays current state immediately, from inside the
      // subscriber's mount effect — a throw there would fail the component,
      // not just its own state sync.
      const { subscribe } = require('../audioEngine');

      expect(() =>
        subscribe(() => {
          throw new Error('subscriber blew up');
        }),
      ).not.toThrow();
    });

    it('still returns a working unsubscribe for a throwing listener', async () => {
      const { subscribe, loadTrack } = require('../audioEngine');
      const throwing = jest.fn(() => {
        throw new Error('subscriber blew up');
      });

      const unsubscribe = subscribe(throwing);
      throwing.mockClear();
      unsubscribe();

      await loadTrack('file:///test.mp3');

      expect(throwing).not.toHaveBeenCalled();
    });

    it('a throwing listener does not stop the others from being notified', async () => {
      const { subscribe, loadTrack } = require('../audioEngine');
      const throwing = jest.fn(() => {
        throw new Error('subscriber blew up');
      });
      const listener = jest.fn();

      subscribe(throwing);
      subscribe(listener);
      throwing.mockClear();
      listener.mockClear();

      await loadTrack('file:///test.mp3');

      // Registered first, so without isolation its throw would abort the
      // fan-out and leave the later subscriber on a stale transport.
      expect(throwing).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'loading' }),
      );
    });

    it('a throwing listener does not escape the status-update callback', async () => {
      const { subscribe, loadTrack } = require('../audioEngine');
      await loadTrack('file:///test.mp3');

      subscribe(() => {
        throw new Error('subscriber blew up');
      });

      // Most notifications originate inside expo-audio's native
      // playbackStatusUpdate callback; a throw there would escape into the
      // event emitter rather than being contained by the engine.
      expect(() =>
        statusCallback?.(makeLoadedStatus({ currentTime: 1 })),
      ).not.toThrow();
    });

    it('subscribing from inside a listener does not notify the newcomer mid-pass', async () => {
      const { subscribe, loadTrack } = require('../audioEngine');
      await loadTrack('file:///test.mp3');

      const latecomer = jest.fn();
      let calls = 0;
      // Call 1 is this listener's own replay from subscribe(); call 2 is the
      // status broadcast below, so the newcomer joins mid-pass.
      subscribe(() => {
        calls += 1;
        if (calls === 2) subscribe(latecomer);
      });
      latecomer.mockClear();

      statusCallback?.(makeLoadedStatus({ currentTime: 1 }));

      // Exactly one call — the replay subscribe() gives it. Iterating the live
      // Set would visit the newly added entry as well and deliver the same
      // state twice (and a listener that re-subscribes itself would spin).
      expect(calls).toBe(2);
      expect(latecomer).toHaveBeenCalledTimes(1);
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

    // On a cold web load hydrateSettings is a real IndexedDB read, so this can
    // resolve after the player was already seeded with the default. Reporting
    // the saved level without applying it left the slider at 20% while the
    // track played at 100%.
    it('applies a persisted volume that resolves after the track loaded', async () => {
      const { loadTrack, loadPersistedVolume } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      mockVolumeSet.mockClear();

      mockGetNumber.mockImplementation((key: string, fallback: number) =>
        key === 'playback.volume' ? 0.2 : fallback,
      );
      await loadPersistedVolume();

      expect(mockVolumeSet).toHaveBeenCalledWith(0.2);
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

    it('loadPersistedVolume hydrates from storage and notifies', async () => {
      mockGetNumber.mockImplementation(() => 0.6);
      const {
        loadPersistedVolume,
        getVolume,
        subscribe,
      } = require('../audioEngine');

      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      await loadPersistedVolume();

      expect(mockGetNumber).toHaveBeenCalledWith('playback.volume', 1);
      expect(getVolume()).toBe(0.6);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ volume: 0.6 }),
      );
    });

    it('loadPersistedVolume falls back to default on storage error', async () => {
      mockGetNumber.mockImplementation(() => {
        throw new Error('db error');
      });
      const { loadPersistedVolume, getVolume } = require('../audioEngine');

      await expect(loadPersistedVolume()).resolves.toBeUndefined();
      expect(getVolume()).toBe(1);
    });

    // Regression for #163: on a cold web load the settings cache hydrates
    // asynchronously. The engine must defer the persisted read until
    // hydration resolves, so the saved value is never lost to an early read.
    it('loadPersistedVolume waits for hydration before reading the persisted value', async () => {
      let resolveHydration!: () => void;
      mockHydrateSettings.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveHydration = resolve;
          }),
      );
      mockGetNumber.mockImplementation(() => 0.4);
      const { loadPersistedVolume, getVolume } = require('../audioEngine');

      const pending = loadPersistedVolume();
      // Hydration is still in flight: the persisted read has not happened and
      // the engine still holds the default.
      expect(mockGetNumber).not.toHaveBeenCalled();
      expect(getVolume()).toBe(1);

      resolveHydration();
      await pending;

      expect(mockGetNumber).toHaveBeenCalledWith('playback.volume', 1);
      expect(getVolume()).toBe(0.4);
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

    it('reports paused status when finished with the loop disarmed', async () => {
      const {
        loadTrack,
        setLoopEnabled,
        subscribe,
      } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      // The loop defaults to armed (a finish would rewind and keep playing);
      // disarm it so the natural end parks the playhead at the end.
      setLoopEnabled(false);
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

  describe('commitMarkerPlacement', () => {
    it('parks the playhead at A when A is committed', async () => {
      const {
        loadTrack,
        setMarkerA,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 30 }));
      setMarkerA(10000);
      mockSeekTo.mockClear();

      await commitMarkerPlacement('A');

      expect(mockSeekTo).toHaveBeenCalledWith(10);
    });

    it('moves to A but never starts or stops playback', async () => {
      const {
        loadTrack,
        setMarkerA,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: false, currentTime: 30 }));
      setMarkerA(10000);
      mockSeekTo.mockClear();
      mockPlay.mockClear();
      mockPause.mockClear();

      await commitMarkerPlacement('A');

      expect(mockSeekTo).toHaveBeenCalledWith(10);
      expect(mockPlay).not.toHaveBeenCalled();
      expect(mockPause).not.toHaveBeenCalled();
    });

    it('moves to A on an A commit even from inside the region', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));
      setMarkerA(10000);
      setMarkerB(20000);
      mockSeekTo.mockClear();

      await commitMarkerPlacement('A');

      expect(mockSeekTo).toHaveBeenCalledWith(10);
    });

    it('leaves the playhead alone when a B commit keeps it inside the region', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));
      setMarkerA(10000);
      setMarkerB(20000);
      mockSeekTo.mockClear();

      await commitMarkerPlacement('B');

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('rescues the playhead to A when a B commit strands it past B', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 40 }));
      setMarkerA(10000);
      setMarkerB(25000);
      mockSeekTo.mockClear();

      await commitMarkerPlacement('B');

      expect(mockSeekTo).toHaveBeenCalledWith(10);
    });

    it('rescues the playhead to A when a B commit leaves it before A', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 5 }));
      setMarkerA(10000);
      setMarkerB(25000);
      mockSeekTo.mockClear();

      await commitMarkerPlacement('B');

      expect(mockSeekTo).toHaveBeenCalledWith(10);
    });

    it('is a no-op when no A marker is set', async () => {
      const { loadTrack, commitMarkerPlacement } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 30 }));
      mockSeekTo.mockClear();

      await commitMarkerPlacement('A');

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('is a no-op for a B commit with no complete region', async () => {
      const {
        loadTrack,
        setMarkerA,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ currentTime: 30 }));
      setMarkerA(10000);
      mockSeekTo.mockClear();

      await commitMarkerPlacement('B');

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('is a no-op when no track is loaded', async () => {
      const { commitMarkerPlacement } = require('../audioEngine');

      await commitMarkerPlacement('A');

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('redirects an in-flight preview restore instead of seeking itself', async () => {
      const {
        loadTrack,
        setMarkerA,
        startMonitor,
        stopMonitor,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 30 }));
      setMarkerA(10000);
      await startMonitor(50000); // captures the 30s playhead
      mockSeekTo.mockClear();

      await commitMarkerPlacement('A');
      // Nothing moves yet — the pending restore now carries the new target.
      expect(mockSeekTo).not.toHaveBeenCalled();

      await stopMonitor();

      // Exactly one seek, and to A rather than the captured 30s position.
      expect(mockSeekTo).toHaveBeenCalledTimes(1);
      expect(mockSeekTo).toHaveBeenCalledWith(10);
    });

    it('keeps the preview restore in charge of play/pause when redirected', async () => {
      const {
        loadTrack,
        setMarkerA,
        startMonitor,
        stopMonitor,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: false, currentTime: 30 }));
      setMarkerA(10000);
      await startMonitor(50000);
      mockPlay.mockClear();
      mockPause.mockClear();

      await commitMarkerPlacement('A');
      await stopMonitor();

      // Paused before the drag, so still paused — parked at A, not playing.
      expect(mockPause).toHaveBeenCalled();
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('judges a B commit by the restored playhead, not the preview window', async () => {
      const {
        loadTrack,
        setMarkerA,
        setMarkerB,
        startMonitor,
        stopMonitor,
        commitMarkerPlacement,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 15 }));
      setMarkerA(10000);
      setMarkerB(20000);
      await startMonitor(50000); // captures 15s; preview runs near 48s
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 48 }));
      mockSeekTo.mockClear();

      await commitMarkerPlacement('B');
      await stopMonitor();

      // The 15s playhead it returns to is inside [10s, 20s), so the commit
      // leaves it be — the monitor's own 48s position is not the subject.
      expect(mockSeekTo).toHaveBeenCalledTimes(1);
      expect(mockSeekTo).toHaveBeenCalledWith(15);
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

    it('does not loop back mid-track when only markerA is set', async () => {
      const { loadTrack, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
      mockSeekTo.mockClear();

      // Without B the loop region runs to the end of the track, so playback
      // mid-track carries on undisturbed.
      statusCallback?.(makeLoadedStatus({ playing: true, currentTime: 50 }));

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('loops the whole track on natural finish with no markers set', async () => {
      const { loadTrack, subscribe } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();
      mockSeekTo.mockClear();
      mockPlay.mockClear();

      statusCallback?.(
        makeLoadedStatus({
          playing: false,
          didJustFinish: true,
          currentTime: 60,
        }),
      );

      // The loop defaults to armed, so the finish rewinds to the start and
      // keeps playing — looping needs no A/B markers. The restart waits for
      // the rewind: play against a player still sitting at the end of the
      // track is ignored, which is what used to kill the loop at the wrap.
      expect(mockSeekTo).toHaveBeenCalledWith(0);
      expect(mockPlay).not.toHaveBeenCalled();
      await flushRewind();
      expect(mockPlay).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'playing', positionMs: 0 }),
      );
    });

    it('loops from markerA on natural finish when only A is set', async () => {
      const { loadTrack, setMarkerA } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setMarkerA(5000);
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
      await flushRewind();
      expect(mockPlay).toHaveBeenCalled();
    });

    it('does not loop the whole track when the loop is disarmed', async () => {
      const {
        loadTrack,
        setLoopEnabled,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      setLoopEnabled(false);
      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();
      mockSeekTo.mockClear();
      mockPlay.mockClear();

      statusCallback?.(
        makeLoadedStatus({
          playing: false,
          didJustFinish: true,
          currentTime: 60,
        }),
      );

      expect(mockSeekTo).not.toHaveBeenCalled();
      expect(mockPlay).not.toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paused', positionMs: 60000 }),
      );
    });

    it('invokes the per-loop count-in handler on a whole-track rewind', async () => {
      const {
        loadTrack,
        setLoopRestartHandler,
        subscribe,
      } = require('../audioEngine');

      await loadTrack('file:///test.mp3');
      statusCallback?.(makeLoadedStatus());
      const handler = jest.fn();
      setLoopRestartHandler(handler);
      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();
      mockPlay.mockClear();

      statusCallback?.(
        makeLoadedStatus({
          playing: false,
          didJustFinish: true,
          currentTime: 60,
        }),
      );

      // Rewinds to the start, pauses there, and hands off to the count-in —
      // same contract as an A/B loop restart.
      expect(mockSeekTo).toHaveBeenCalledWith(0);
      expect(mockPlay).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paused', positionMs: 0 }),
      );
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
      await flushRewind();
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

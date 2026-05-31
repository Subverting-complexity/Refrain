/* eslint-disable @typescript-eslint/no-require-imports */

const mockPlayAsync = jest.fn();
const mockPauseAsync = jest.fn();
const mockStopAsync = jest.fn();
const mockSetPositionAsync = jest.fn();
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

    it('resets to idle when createAsync throws', async () => {
      mockCreateAsync.mockRejectedValueOnce(new Error('unsupported format'));
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();
      subscribe(listener);
      listener.mockClear();

      await loadTrack('file:///bad.mp3');

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall).toEqual(
        expect.objectContaining({ status: 'idle', positionMs: 0 }),
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

    it('resets position when playing after track finished', async () => {
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
      });
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

      expect(listener).toHaveBeenCalledWith({
        status: 'playing',
        positionMs: 5000,
        durationMs: 60000,
      });
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

      expect(listener).toHaveBeenCalledWith({
        status: 'paused',
        positionMs: 60000,
        durationMs: 60000,
      });
    });

    it('reports idle on error status', async () => {
      const { loadTrack, subscribe } = require('../audioEngine');
      const listener = jest.fn();

      await loadTrack('file:///test.mp3');
      subscribe(listener);
      listener.mockClear();

      statusCallback?.({ isLoaded: false, error: 'playback error' });

      expect(listener).toHaveBeenCalledWith({
        status: 'idle',
        positionMs: 0,
        durationMs: 0,
      });
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
});

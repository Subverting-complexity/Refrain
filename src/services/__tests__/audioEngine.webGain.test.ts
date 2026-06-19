/**
 * Web Audio gain path for the audio engine. Exercises the iOS-Safari true
 * attenuation route (`Platform.OS === 'web'` + a sourceable media element)
 * and its fallback to the expo-audio player's `volume` property.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

class FakeMedia {
  volume = 1;
}

let media: FakeMedia | null;

const mockPlay = jest.fn();
const mockSeekTo = jest.fn().mockResolvedValue(undefined);
const mockRemove = jest.fn();
const mockVolumeSet = jest.fn<void, [number]>();
const mockAddListener = jest.fn(() => ({ remove: jest.fn() }));

const mockCreateAudioPlayer = jest.fn().mockImplementation(() => {
  const player: Record<string, unknown> = {
    play: mockPlay,
    pause: jest.fn(),
    seekTo: mockSeekTo,
    remove: mockRemove,
    addListener: mockAddListener,
    media,
  };
  Object.defineProperty(player, 'volume', {
    get: () => 1,
    set: (v: number) => mockVolumeSet(v),
  });
  return player;
});

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('../settingsStore', () => ({
  getNumber: (_key: string, fallback: number) => fallback,
  setNumber: jest.fn(),
}));

// Stub the marker store so requiring the engine doesn't pull in the
// SQLite/IndexedDB-backed database module these gain-path tests never exercise.
jest.mock('../markerStore', () => ({
  getActiveMarkers: jest.fn(() => null),
  setActiveMarkers: jest.fn(),
}));

const mockAttach = jest.fn<boolean, [HTMLMediaElement]>();
const mockSetGain = jest.fn<void, [number]>();
const mockResume = jest.fn<void, []>();
const mockDetach = jest.fn<void, []>();
const mockIsActive = jest.fn<boolean, []>();

jest.mock('../webAudioGain', () => ({
  isWebAudioGainSupported: () => true,
  attach: (m: HTMLMediaElement) => mockAttach(m),
  setGain: (v: number) => mockSetGain(v),
  resume: () => mockResume(),
  detach: () => mockDetach(),
  isActive: () => mockIsActive(),
}));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockSeekTo.mockResolvedValue(undefined);
  mockAttach.mockReturnValue(true);
  media = new FakeMedia();
  (global as Record<string, unknown>).HTMLMediaElement = FakeMedia;
});

afterEach(() => {
  delete (global as Record<string, unknown>).HTMLMediaElement;
});

describe('web gain routing', () => {
  it('attaches the gain graph and seeds it at load', async () => {
    const { loadTrack } = require('../audioEngine');

    await loadTrack('blob:track');

    expect(mockAttach).toHaveBeenCalledWith(media);
    // Media plays at full volume; the gain node does the attenuation.
    expect(media?.volume).toBe(1);
    expect(mockSetGain).toHaveBeenCalledWith(1);
  });

  it('routes volume through the gain node and resumes on change', async () => {
    const { loadTrack, setVolume } = require('../audioEngine');
    await loadTrack('blob:track');
    mockSetGain.mockClear();
    mockVolumeSet.mockClear();

    setVolume(0.4);

    expect(mockSetGain).toHaveBeenCalledWith(0.4);
    expect(mockResume).toHaveBeenCalled();
    expect(mockVolumeSet).not.toHaveBeenCalledWith(0.4);
  });

  it('resumes the context on play', async () => {
    const { loadTrack, play } = require('../audioEngine');
    await loadTrack('blob:track');
    mockResume.mockClear();

    await play();

    expect(mockResume).toHaveBeenCalled();
    expect(mockPlay).toHaveBeenCalled();
  });

  it('detaches the graph on unload', async () => {
    const { loadTrack, unloadTrack } = require('../audioEngine');
    await loadTrack('blob:track');

    await unloadTrack();

    expect(mockDetach).toHaveBeenCalled();
  });

  it('detaches the previous graph before loading a new track', async () => {
    const { loadTrack } = require('../audioEngine');
    await loadTrack('blob:first');
    mockDetach.mockClear();

    await loadTrack('blob:second');

    // unloadTrack runs first inside loadTrack, tearing down the old graph.
    expect(mockDetach).toHaveBeenCalled();
  });
});

describe('fallback to native volume', () => {
  it('uses the player volume when the gain graph fails to attach', async () => {
    mockAttach.mockReturnValue(false);
    const { loadTrack, setVolume } = require('../audioEngine');
    await loadTrack('blob:track');

    setVolume(0.4);

    expect(mockSetGain).not.toHaveBeenCalled();
    expect(mockVolumeSet).toHaveBeenCalledWith(0.4);
  });

  it('uses the player volume when the media element is not sourceable', async () => {
    media = null; // expo-audio internal shape changed — no element.
    const { loadTrack, setVolume } = require('../audioEngine');
    await loadTrack('blob:track');

    setVolume(0.6);

    expect(mockAttach).not.toHaveBeenCalled();
    expect(mockVolumeSet).toHaveBeenCalledWith(0.6);
  });

  it('falls back when seeding the attached graph throws', async () => {
    // A media element whose volume setter throws after a successful attach.
    const throwingMedia = Object.defineProperty(new FakeMedia(), 'volume', {
      set() {
        throw new Error('volume rejected');
      },
      get() {
        return 1;
      },
    });
    media = throwingMedia as FakeMedia;
    const { loadTrack, setVolume } = require('../audioEngine');

    await loadTrack('blob:track');

    expect(mockDetach).toHaveBeenCalled();
    setVolume(0.2);
    expect(mockVolumeSet).toHaveBeenCalledWith(0.2);
  });
});

describe('web media session wiring', () => {
  interface FakeSession {
    metadata: unknown;
    playbackState: string;
    handlers: Record<string, (() => void) | null>;
    setActionHandler: (action: string, handler: (() => void) | null) => void;
  }

  function installSession(): FakeSession {
    const session: FakeSession = {
      metadata: undefined,
      playbackState: 'none',
      handlers: {},
      setActionHandler: (action, handler) => {
        session.handlers[action] = handler;
      },
    };
    (global as Record<string, unknown>).navigator = { mediaSession: session };
    (global as Record<string, unknown>).MediaMetadata = class {
      constructor(public init: unknown) {}
    };
    return session;
  }

  afterEach(() => {
    delete (global as Record<string, unknown>).navigator;
    delete (global as Record<string, unknown>).MediaMetadata;
  });

  it('wires the OS media controls to the transport on web load', async () => {
    const session = installSession();
    const { loadTrack, play, pause } = require('../audioEngine');

    await loadTrack('blob:track', undefined, 'My Song');

    // Triggering the OS "play" control plays the engine player.
    session.handlers.play?.();
    expect(mockPlay).toHaveBeenCalled();

    await play();
    expect(session.playbackState).toBe('playing');
    await pause();
    expect(session.playbackState).toBe('paused');
  });

  it('clears the media session on unload', async () => {
    const session = installSession();
    const { loadTrack, unloadTrack } = require('../audioEngine');

    await loadTrack('blob:track', undefined, 'My Song');
    await unloadTrack();

    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect(session.handlers.play).toBeNull();
  });
});

describe('rolling monitor (web fallback)', () => {
  it('seeks once and resumes the gain context on startMonitor', async () => {
    const { loadTrack, startMonitor } = require('../audioEngine');
    await loadTrack('blob:track');
    mockSeekTo.mockClear();
    mockPlay.mockClear();
    mockResume.mockClear();

    // Window [30s-2s, 30s+2s] -> start at 28s.
    await startMonitor(30000);

    expect(mockSeekTo).toHaveBeenCalledWith(28);
    expect(mockPlay).toHaveBeenCalled();
    expect(mockResume).toHaveBeenCalled();
  });

  it('does not re-seek per update on web (degrades to bounds-only follow)', async () => {
    const {
      loadTrack,
      startMonitor,
      updateMonitor,
    } = require('../audioEngine');
    await loadTrack('blob:track');
    await startMonitor(30000);
    mockSeekTo.mockClear();

    // Continuous per-update seeking scrubs badly on web / iOS Safari, so the
    // monitor only moves the loop bounds here — no seek on update.
    updateMonitor(50000);
    updateMonitor(10000);

    expect(mockSeekTo).not.toHaveBeenCalled();
  });
});

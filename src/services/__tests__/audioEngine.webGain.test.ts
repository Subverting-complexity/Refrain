/**
 * Web Audio gain path for the audio engine. Exercises the iOS-Safari true
 * attenuation route (`Platform.OS === 'web'` + a sourceable media element)
 * and its fallback to expo-av's native `setVolumeAsync`.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

class FakeMedia {
  volume = 1;
}

let mediaKey: FakeMedia | null;

const mockPlayAsync = jest.fn();
const mockSetVolumeAsync = jest.fn();
const mockUnloadAsync = jest.fn();
const mockSetOnPlaybackStatusUpdate = jest.fn();

const mockCreateAsync = jest.fn().mockImplementation(() =>
  Promise.resolve({
    sound: {
      playAsync: mockPlayAsync,
      pauseAsync: jest.fn(),
      stopAsync: jest.fn(),
      setPositionAsync: jest.fn().mockResolvedValue(undefined),
      setVolumeAsync: mockSetVolumeAsync,
      unloadAsync: mockUnloadAsync,
      setOnPlaybackStatusUpdate: mockSetOnPlaybackStatusUpdate,
      _key: mediaKey,
    },
  }),
);

jest.mock('expo-av', () => ({
  Audio: {
    Sound: { createAsync: mockCreateAsync },
    setAudioModeAsync: jest.fn(),
  },
}));

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('../settingsStore', () => ({
  getNumber: (_key: string, fallback: number) => fallback,
  setNumber: jest.fn(),
}));

const mockAttach = jest.fn<boolean, [HTMLMediaElement]>();
const mockSetGain = jest.fn<void, [number]>();
const mockResume = jest.fn<void, []>();
const mockDetach = jest.fn<void, []>();
const mockIsActive = jest.fn<boolean, []>();

jest.mock('../webAudioGain', () => ({
  isWebAudioGainSupported: () => true,
  attach: (media: HTMLMediaElement) => mockAttach(media),
  setGain: (v: number) => mockSetGain(v),
  resume: () => mockResume(),
  detach: () => mockDetach(),
  isActive: () => mockIsActive(),
}));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockSetVolumeAsync.mockResolvedValue(undefined);
  mockUnloadAsync.mockResolvedValue(undefined);
  mockAttach.mockReturnValue(true);
  mediaKey = new FakeMedia();
  (global as Record<string, unknown>).HTMLMediaElement = FakeMedia;
});

afterEach(() => {
  delete (global as Record<string, unknown>).HTMLMediaElement;
});

describe('web gain routing', () => {
  it('attaches the gain graph and seeds it at load', async () => {
    const { loadTrack } = require('../audioEngine');

    await loadTrack('blob:track');

    expect(mockAttach).toHaveBeenCalledWith(mediaKey);
    // Media plays at full volume; the gain node does the attenuation.
    expect(mediaKey?.volume).toBe(1);
    expect(mockSetGain).toHaveBeenCalledWith(1);
  });

  it('routes volume through the gain node and resumes on change', async () => {
    const { loadTrack, setVolume } = require('../audioEngine');
    await loadTrack('blob:track');
    mockSetGain.mockClear();

    setVolume(0.4);

    expect(mockSetGain).toHaveBeenCalledWith(0.4);
    expect(mockResume).toHaveBeenCalled();
    expect(mockSetVolumeAsync).not.toHaveBeenCalled();
  });

  it('resumes the context on play', async () => {
    const { loadTrack, play } = require('../audioEngine');
    await loadTrack('blob:track');
    mockResume.mockClear();

    await play();

    expect(mockResume).toHaveBeenCalled();
    expect(mockPlayAsync).toHaveBeenCalled();
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
  it('uses setVolumeAsync when the gain graph fails to attach', async () => {
    mockAttach.mockReturnValue(false);
    const { loadTrack, setVolume } = require('../audioEngine');
    await loadTrack('blob:track');

    setVolume(0.4);

    expect(mockSetGain).not.toHaveBeenCalled();
    expect(mockSetVolumeAsync).toHaveBeenCalledWith(0.4);
  });

  it('uses setVolumeAsync when the media element is not sourceable', async () => {
    mediaKey = null; // expo-av internal shape changed — no element.
    const { loadTrack, setVolume } = require('../audioEngine');
    await loadTrack('blob:track');

    setVolume(0.6);

    expect(mockAttach).not.toHaveBeenCalled();
    expect(mockSetVolumeAsync).toHaveBeenCalledWith(0.6);
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
    mediaKey = throwingMedia as FakeMedia;
    const { loadTrack, setVolume } = require('../audioEngine');

    await loadTrack('blob:track');

    expect(mockDetach).toHaveBeenCalled();
    setVolume(0.2);
    expect(mockSetVolumeAsync).toHaveBeenCalledWith(0.2);
  });
});

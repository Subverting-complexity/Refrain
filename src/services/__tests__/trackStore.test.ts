import { loadTracks, saveTracks } from '../trackStore';
import { Track } from '../../types';

const mockWrite = jest.fn();
const mockMove = jest.fn();
const mockText = jest.fn();

let mockStoreExists = false;

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((_base: string, name: string) => ({
    get exists() {
      return name === 'tracks.json' ? mockStoreExists : false;
    },
    text: mockText,
    write: mockWrite,
    move: mockMove,
  })),
  Paths: { document: 'file:///data' },
}));

const sampleTrack: Track = {
  id: 'track-1',
  filename: 'song.mp3',
  uri: 'file:///data/tracks/track-1.mp3',
  format: 'mp3',
  durationMs: 42_000,
  fileSizeBytes: 1_000_000,
  importedAt: 1700000000000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreExists = false;
});

describe('loadTracks', () => {
  it('returns empty array when store file does not exist', async () => {
    mockStoreExists = false;

    const tracks = await loadTracks();

    expect(tracks).toEqual([]);
  });

  it('parses and returns tracks from store file', async () => {
    mockStoreExists = true;
    mockText.mockResolvedValue(JSON.stringify([sampleTrack]));

    const tracks = await loadTracks();

    expect(tracks).toEqual([sampleTrack]);
  });

  it('returns empty array on corrupt JSON', async () => {
    mockStoreExists = true;
    mockText.mockResolvedValue('not valid json{{{');

    const tracks = await loadTracks();

    expect(tracks).toEqual([]);
  });

  it('returns empty array when text() rejects', async () => {
    mockStoreExists = true;
    mockText.mockRejectedValue(new Error('read error'));

    const tracks = await loadTracks();

    expect(tracks).toEqual([]);
  });
});

describe('saveTracks', () => {
  it('writes JSON to tmp file then moves atomically', async () => {
    await saveTracks([sampleTrack]);

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([sampleTrack]));
    expect(mockMove).toHaveBeenCalled();
  });

  it('saves empty array', async () => {
    await saveTracks([]);

    expect(mockWrite).toHaveBeenCalledWith('[]');
    expect(mockMove).toHaveBeenCalled();
  });
});

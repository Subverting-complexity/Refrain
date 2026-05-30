/* eslint-disable @typescript-eslint/no-require-imports */
import { Track } from '../../types';

const mockRunSync = jest.fn();
const mockGetAllSync = jest.fn();
const mockExecSync = jest.fn();
const mockCloseSync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    runSync: mockRunSync,
    getAllSync: mockGetAllSync,
    execSync: mockExecSync,
    closeSync: mockCloseSync,
  })),
}));

const mockText = jest.fn();
const mockDelete = jest.fn();
let mockJsonExists = false;

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    get exists() {
      return mockJsonExists;
    },
    text: mockText,
    delete: mockDelete,
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
  mockJsonExists = false;
});

describe('migration from JSON', () => {
  it('migrates tracks.json on first load then deletes the file', async () => {
    jest.resetModules();

    mockJsonExists = true;
    mockText.mockResolvedValue(JSON.stringify([sampleTrack]));
    mockGetAllSync.mockReturnValue([sampleTrack]);

    const { loadTracks } = require('../trackStore');
    await loadTracks();

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE'),
      sampleTrack.id,
      sampleTrack.filename,
      sampleTrack.uri,
      sampleTrack.format,
      sampleTrack.durationMs,
      sampleTrack.fileSizeBytes,
      sampleTrack.importedAt,
    );
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe('loadTracks', () => {
  it('returns tracks from the database', async () => {
    jest.resetModules();

    mockGetAllSync.mockReturnValue([sampleTrack]);

    const { loadTracks } = require('../trackStore');
    const tracks = await loadTracks();

    expect(tracks).toEqual([sampleTrack]);
    expect(mockGetAllSync).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
    );
  });
});

describe('insertTrack', () => {
  it('inserts a track into the database', () => {
    jest.resetModules();

    const { insertTrack } = require('../trackStore');
    insertTrack(sampleTrack);

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tracks'),
      sampleTrack.id,
      sampleTrack.filename,
      sampleTrack.uri,
      sampleTrack.format,
      sampleTrack.durationMs,
      sampleTrack.fileSizeBytes,
      sampleTrack.importedAt,
    );
  });
});

describe('deleteTrack', () => {
  it('deletes a track by id', () => {
    jest.resetModules();

    const { deleteTrack } = require('../trackStore');
    deleteTrack('track-1');

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tracks'),
      'track-1',
    );
  });
});

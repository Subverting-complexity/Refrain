/* eslint-disable @typescript-eslint/no-require-imports */
import { Track } from '../../types';

const mockRunSync = jest.fn();
const mockGetAllSync = jest.fn();
const mockGetFirstSync = jest.fn();
const mockExecSync = jest.fn();
const mockCloseSync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    runSync: mockRunSync,
    getAllSync: mockGetAllSync,
    getFirstSync: mockGetFirstSync,
    execSync: mockExecSync,
    closeSync: mockCloseSync,
  })),
}));

const mockText = jest.fn();
const mockDelete = jest.fn();
let mockJsonExists = false;
// Map of file URI -> exists. Files default to existing.
let mockFileExists: Record<string, boolean> = {};
// Entries returned by Directory.list().
let mockDirEntries: { name: string; uri: string }[] = [];
let mockDirExists = true;

jest.mock('expo-file-system', () => {
  const File = jest.fn().mockImplementation((...args: string[]) => {
    const uri = args[args.length - 1];
    return {
      uri,
      get exists() {
        // tracks.json uses the migration flag; track files use the map.
        if (uri === 'file:///data/tracks.json') return mockJsonExists;
        return mockFileExists[uri] ?? true;
      },
      text: mockText,
      delete: () => mockDelete(uri),
    };
  });
  const Directory = jest.fn().mockImplementation(() => ({
    get exists() {
      return mockDirExists;
    },
    list: () =>
      mockDirEntries.map((e) =>
        Object.assign(Object.create(File.prototype), e),
      ),
  }));
  return {
    File,
    Directory,
    Paths: { document: { uri: 'file:///data' } },
  };
});

const sampleTrack: Track = {
  id: 'track-1',
  filename: 'song.mp3',
  uri: 'file:///data/tracks/track-1.mp3',
  format: 'mp3',
  durationMs: 42_000,
  durationEstimated: true,
  fileSizeBytes: 1_000_000,
  importedAt: 1700000000000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockJsonExists = false;
  mockFileExists = {};
  mockDirEntries = [];
  mockDirExists = true;
});

describe('migration from JSON', () => {
  it('migrates tracks.json on first load then deletes the file', async () => {
    jest.resetModules();

    mockJsonExists = true;
    mockText.mockResolvedValue(JSON.stringify([sampleTrack]));
    mockGetAllSync.mockReturnValue([
      { ...sampleTrack, uri: 'tracks/track-1.mp3', durationEstimated: 1 },
    ]);

    const { loadTracks } = require('../trackStore');
    await loadTracks();

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE'),
      sampleTrack.id,
      sampleTrack.filename,
      `tracks/${sampleTrack.id}.${sampleTrack.format}`,
      sampleTrack.format,
      sampleTrack.durationMs,
      1,
      sampleTrack.fileSizeBytes,
      sampleTrack.importedAt,
    );
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe('loadTracks', () => {
  it('returns tracks from the database with boolean durationEstimated', async () => {
    jest.resetModules();

    const dbRow = {
      ...sampleTrack,
      uri: 'tracks/track-1.mp3',
      durationEstimated: 1,
    };
    mockGetAllSync.mockReturnValue([dbRow]);

    const { loadTracks } = require('../trackStore');
    const tracks = await loadTracks();

    expect(tracks).toEqual([sampleTrack]);
    expect(tracks[0].durationEstimated).toBe(true);
    expect(mockGetAllSync).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
    );
  });

  it('resolves relative URIs to absolute using the current sandbox root', async () => {
    jest.resetModules();

    mockGetAllSync.mockReturnValue([
      { ...sampleTrack, uri: 'tracks/track-1.mp3', durationEstimated: 1 },
    ]);

    const { loadTracks } = require('../trackStore');
    const tracks = await loadTracks();

    expect(tracks[0].uri).toBe('file:///data/tracks/track-1.mp3');
  });

  it('sweeps orphan files on load', async () => {
    jest.resetModules();

    mockGetAllSync.mockReturnValue([
      { ...sampleTrack, uri: 'tracks/track-1.mp3', durationEstimated: 1 },
    ]);
    mockDirEntries = [
      { name: 'track-1.mp3', uri: sampleTrack.uri },
      { name: 'orphan.wav', uri: 'file:///data/tracks/orphan.wav' },
    ];

    const { loadTracks } = require('../trackStore');
    await loadTracks();

    expect(mockDelete).toHaveBeenCalledWith('file:///data/tracks/orphan.wav');
  });

  it('converts durationEstimated 0 to false', async () => {
    jest.resetModules();

    const dbRow = {
      ...sampleTrack,
      uri: 'tracks/track-1.mp3',
      durationEstimated: 0,
    };
    mockGetAllSync.mockReturnValue([dbRow]);

    const { loadTracks } = require('../trackStore');
    const tracks = await loadTracks();

    expect(tracks[0].durationEstimated).toBe(false);
  });
});

describe('insertTrack', () => {
  it('inserts a track into the database with a relative URI and durationEstimated as integer', () => {
    jest.resetModules();

    const { insertTrack } = require('../trackStore');
    insertTrack(sampleTrack);

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tracks'),
      sampleTrack.id,
      sampleTrack.filename,
      `tracks/${sampleTrack.id}.${sampleTrack.format}`,
      sampleTrack.format,
      sampleTrack.durationMs,
      1,
      sampleTrack.fileSizeBytes,
      sampleTrack.importedAt,
    );
  });
});

describe('updateTrackDuration', () => {
  it('updates duration and marks as not estimated', () => {
    jest.resetModules();

    const { updateTrackDuration } = require('../trackStore');
    updateTrackDuration('track-1', 45_000);

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tracks SET durationMs'),
      45_000,
      'track-1',
    );
  });
});

describe('deleteTrack', () => {
  it('deletes a track by id', () => {
    jest.resetModules();
    mockGetFirstSync.mockReturnValue({ uri: 'tracks/track-1.mp3' });

    const { deleteTrack } = require('../trackStore');
    deleteTrack('track-1');

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tracks'),
      'track-1',
    );
  });

  it('cascade-removes the track marker row', () => {
    jest.resetModules();
    mockGetFirstSync.mockReturnValue({ uri: 'tracks/track-1.mp3' });

    const { deleteTrack } = require('../trackStore');
    deleteTrack('track-1');

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM track_markers'),
      'track-1',
    );
  });

  it('cascade-removes the track segment profiles', () => {
    jest.resetModules();
    mockGetFirstSync.mockReturnValue({ uri: 'tracks/track-1.mp3' });

    const { deleteTrack } = require('../trackStore');
    deleteTrack('track-1');

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM marker_profiles'),
      'track-1',
    );
  });

  it('deletes the audio file from disk on removal', () => {
    jest.resetModules();
    mockGetFirstSync.mockReturnValue({ uri: 'tracks/track-1.mp3' });
    mockFileExists[sampleTrack.uri] = true;

    const { deleteTrack } = require('../trackStore');
    deleteTrack('track-1');

    expect(mockGetFirstSync).toHaveBeenCalledWith(
      expect.stringContaining('SELECT uri'),
      'track-1',
    );
    expect(mockDelete).toHaveBeenCalledWith(sampleTrack.uri);
  });

  it('looks up the uri before deleting the row', () => {
    jest.resetModules();
    const callOrder: string[] = [];
    mockGetFirstSync.mockImplementation(() => {
      callOrder.push('lookup');
      return { uri: 'tracks/track-1.mp3' };
    });
    mockRunSync.mockImplementation((sql: string) => {
      if (sql.includes('track_markers')) callOrder.push('delete-markers');
      else if (sql.includes('marker_profiles'))
        callOrder.push('delete-profiles');
      else callOrder.push('delete-row');
    });

    const { deleteTrack } = require('../trackStore');
    deleteTrack('track-1');

    expect(callOrder).toEqual([
      'lookup',
      'delete-row',
      'delete-markers',
      'delete-profiles',
    ]);
  });

  it('does not throw when the file is already missing', () => {
    jest.resetModules();
    mockGetFirstSync.mockReturnValue({ uri: 'tracks/track-1.mp3' });
    mockFileExists[sampleTrack.uri] = false;

    const { deleteTrack } = require('../trackStore');

    expect(() => deleteTrack('track-1')).not.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('does not attempt a file delete when the track is unknown', () => {
    jest.resetModules();
    mockGetFirstSync.mockReturnValue(null);

    const { deleteTrack } = require('../trackStore');
    deleteTrack('missing');

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tracks'),
      'missing',
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('cleanupOrphanFiles', () => {
  it('deletes files whose id is not in the database', () => {
    jest.resetModules();
    mockGetAllSync.mockReturnValue([{ id: 'track-1' }]);
    mockDirEntries = [
      { name: 'track-1.mp3', uri: 'file:///data/tracks/track-1.mp3' },
      { name: 'orphan.wav', uri: 'file:///data/tracks/orphan.wav' },
    ];

    const { cleanupOrphanFiles } = require('../trackStore');
    const removed = cleanupOrphanFiles();

    expect(removed).toBe(1);
    expect(mockDelete).toHaveBeenCalledWith('file:///data/tracks/orphan.wav');
    expect(mockDelete).not.toHaveBeenCalledWith(
      'file:///data/tracks/track-1.mp3',
    );
  });

  it('returns 0 when the tracks directory does not exist', () => {
    jest.resetModules();
    mockDirExists = false;

    const { cleanupOrphanFiles } = require('../trackStore');

    expect(cleanupOrphanFiles()).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 0 when there are no orphan files', () => {
    jest.resetModules();
    mockGetAllSync.mockReturnValue([{ id: 'track-1' }]);
    mockDirEntries = [
      { name: 'track-1.mp3', uri: 'file:///data/tracks/track-1.mp3' },
    ];

    const { cleanupOrphanFiles } = require('../trackStore');

    expect(cleanupOrphanFiles()).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

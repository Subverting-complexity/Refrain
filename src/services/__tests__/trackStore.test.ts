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
  folderId: null,
  isFavorite: false,
  lastPlayedAt: null,
};

/**
 * Opening the database runs both schema migrations, which read the table
 * columns and check whether the one-off folder flatten has already run.
 *
 * Reporting no columns means every ALTER is issued, against a mocked
 * `execSync` that does nothing with them; what matters is that the flatten
 * is treated as already done, because that is the part of the migration
 * that writes through `runSync` and would otherwise show up in the
 * statement assertions below. Tests that care override these.
 */
beforeEach(() => {
  jest.clearAllMocks();
  mockJsonExists = false;
  mockFileExists = {};
  mockDirEntries = [];
  mockDirExists = true;
  mockGetAllSync.mockReturnValue([]);
  mockGetFirstSync.mockReturnValue({ value: '1' });
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
      null,
      0,
      null,
    );
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe('migration retry on failure', () => {
  it('retries migration within the session when the insert loop throws', async () => {
    jest.resetModules();

    mockJsonExists = true;
    const tracks = [
      { ...sampleTrack, id: 'a' },
      { ...sampleTrack, id: 'b' },
    ];
    mockText.mockResolvedValue(JSON.stringify(tracks));
    mockGetAllSync.mockReturnValue([]);

    // First insert succeeds, second throws
    mockRunSync
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('DB full');
      });

    const { loadTracks } = require('../trackStore');
    await loadTracks();

    // Migration failed mid-loop — json file should NOT be deleted
    expect(mockDelete).not.toHaveBeenCalled();

    // Second call should retry migration (migrated stayed false)
    mockRunSync.mockImplementation(() => {});
    await loadTracks();

    // Now both inserts succeeded on retry, and the json file is deleted
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

describe('getTrack', () => {
  it('returns the track for an id with its uri resolved to an absolute path', async () => {
    jest.resetModules();

    mockGetFirstSync.mockReturnValue({
      ...sampleTrack,
      uri: 'tracks/track-1.mp3',
      durationEstimated: 1,
    });

    const { getTrack } = require('../trackStore');
    const track = await getTrack('track-1');

    expect(track).toEqual(sampleTrack);
    expect(track.uri).toBe('file:///data/tracks/track-1.mp3');
    expect(mockGetFirstSync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ?'),
      'track-1',
    );
  });

  it('returns null when the id is not in the library', async () => {
    jest.resetModules();

    mockGetFirstSync.mockReturnValue(undefined);

    const { getTrack } = require('../trackStore');
    await expect(getTrack('missing')).resolves.toBeNull();
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
      null,
      0,
      null,
    );
  });
});

describe('renameTrack', () => {
  it('updates only the filename column', () => {
    jest.resetModules();

    const { renameTrack } = require('../trackStore');
    renameTrack('track-1', 'Practice take.mp3');

    expect(mockRunSync).toHaveBeenCalledTimes(1);
    const [sql, ...params] = mockRunSync.mock.calls[0];
    expect(sql).toBe('UPDATE tracks SET filename = ? WHERE id = ?');
    expect(params).toEqual(['Practice take.mp3', 'track-1']);
  });

  // The stored uri is `tracks/<id>.<format>` and never derives from the display
  // name, so a rename must not go near the file or any other column.
  it('leaves the audio file and the rest of the row untouched', () => {
    jest.resetModules();

    const { renameTrack } = require('../trackStore');
    renameTrack('track-1', 'Practice take.mp3');

    expect(mockDelete).not.toHaveBeenCalled();
    const sql = mockRunSync.mock.calls[0][0] as string;
    for (const column of [
      'uri',
      'format',
      'durationMs',
      'durationEstimated',
      'fileSizeBytes',
      'importedAt',
    ]) {
      expect(sql).not.toContain(column);
    }
  });

  it('does not touch the marker or segment-profile rows', () => {
    jest.resetModules();

    const { renameTrack } = require('../trackStore');
    renameTrack('track-1', 'Practice take.mp3');

    expect(mockRunSync).not.toHaveBeenCalledWith(
      expect.stringContaining('track_markers'),
      expect.anything(),
    );
    expect(mockRunSync).not.toHaveBeenCalledWith(
      expect.stringContaining('marker_profiles'),
      expect.anything(),
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
    mockGetFirstSync.mockImplementation((sql: string) => {
      // The folder migration reads the settings table on open; only the
      // track's own uri lookup belongs in the recorded order.
      if (sql.includes('settings')) return { value: '1' };
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

describe('loadTracks scopes', () => {
  it('reads every track by default, newest import first', async () => {
    jest.resetModules();
    mockGetAllSync.mockReturnValue([]);

    const { loadTracks } = require('../trackStore');
    await loadTracks();

    // Columns are named rather than starred, so the retired sortOrder column
    // cannot ride along onto the returned track.
    expect(mockGetAllSync).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, filename, uri'),
    );
    expect(mockGetAllSync).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT *'),
    );
  });

  it('reads only starred tracks in the favourites scope', async () => {
    jest.resetModules();
    mockGetAllSync.mockReturnValue([]);

    const { loadTracks } = require('../trackStore');
    await loadTracks({ scope: 'favorites' });

    expect(mockGetAllSync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE isFavorite = 1'),
    );
  });

  it('reads tracks in no folder in the unfiled scope', async () => {
    jest.resetModules();
    mockGetAllSync.mockReturnValue([]);

    const { loadTracks } = require('../trackStore');
    await loadTracks({ scope: 'unfiled' });

    expect(mockGetAllSync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE folderId IS NULL'),
    );
  });

  it('reads one folder in the folder scope', async () => {
    jest.resetModules();
    mockGetAllSync.mockReturnValue([]);

    const { loadTracks } = require('../trackStore');
    await loadTracks({ scope: 'folder', folderId: 'folder-1' });

    expect(mockGetAllSync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE folderId = ?'),
      'folder-1',
    );
  });

  it('maps the favourite and play-time columns onto the track', async () => {
    jest.resetModules();
    mockGetAllSync.mockReturnValue([
      {
        ...sampleTrack,
        uri: 'tracks/track-1.mp3',
        durationEstimated: 1,
        isFavorite: 1,
        lastPlayedAt: 1_700_000_500_000,
      },
    ]);

    const { loadTracks } = require('../trackStore');
    const tracks = await loadTracks();

    expect(tracks[0].isFavorite).toBe(true);
    expect(tracks[0].lastPlayedAt).toBe(1_700_000_500_000);
  });
});

describe('setTrackFavorite', () => {
  it('stars a track', () => {
    jest.resetModules();

    const { setTrackFavorite } = require('../trackStore');
    setTrackFavorite('track-1', true);

    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE tracks SET isFavorite = ? WHERE id = ?',
      1,
      'track-1',
    );
  });

  it('unstars a track', () => {
    jest.resetModules();

    const { setTrackFavorite } = require('../trackStore');
    setTrackFavorite('track-1', false);

    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE tracks SET isFavorite = ? WHERE id = ?',
      0,
      'track-1',
    );
  });
});

describe('markTrackPlayed', () => {
  it('records the timestamp the caller supplies', () => {
    jest.resetModules();

    const { markTrackPlayed } = require('../trackStore');
    markTrackPlayed('track-1', 1_700_000_900_000);

    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE tracks SET lastPlayedAt = ? WHERE id = ?',
      1_700_000_900_000,
      'track-1',
    );
  });
});

describe('getTrackCountsByFolder', () => {
  it('counts per folder alongside all, favourites and unfiled', () => {
    jest.resetModules();
    mockGetAllSync.mockReturnValue([
      { folderId: null, cnt: 2 },
      { folderId: 'folder-1', cnt: 3 },
      { folderId: 'folder-2', cnt: 1 },
    ]);
    mockGetFirstSync.mockReturnValue({ cnt: 4 });

    const { getTrackCountsByFolder } = require('../trackStore');

    expect(getTrackCountsByFolder()).toEqual({
      byFolder: { 'folder-1': 3, 'folder-2': 1 },
      all: 6,
      favorites: 4,
      unfiled: 2,
    });
  });

  it('reports zeroes for an empty library', () => {
    jest.resetModules();
    mockGetAllSync.mockReturnValue([]);
    mockGetFirstSync.mockReturnValue(undefined);

    const { getTrackCountsByFolder } = require('../trackStore');

    expect(getTrackCountsByFolder()).toEqual({
      byFolder: {},
      all: 0,
      favorites: 0,
      unfiled: 0,
    });
  });
});

/**
 * @jest-environment node
 */
import { Track } from '../../types';
import {
  cleanupOrphanFiles,
  deleteTrack,
  getTrack,
  insertTrack,
  getTrackCountsByFolder,
  loadTracks,
  markTrackPlayed,
  renameTrack,
  setTrackFavorite,
  updateTrackDuration,
} from '../trackStore.web';

const mockGetAllStoredTracks = jest.fn();
const mockGetStoredTrack = jest.fn();
const mockPutStoredTrack = jest.fn<Promise<void>, unknown[]>();
const mockDeleteStoredTrack = jest.fn<Promise<void>, [string]>();
const mockGetStoredTrackIds = jest.fn<Promise<string[]>, []>();

// Factories reference the mocks lazily, so the jest.mock calls can sit below
// the import (they are hoisted above it by jest regardless).
jest.mock('../database.web', () => ({
  getAllStoredTracks: () => mockGetAllStoredTracks(),
  getStoredTrack: (id: string) => mockGetStoredTrack(id),
  putStoredTrack: (track: unknown) => mockPutStoredTrack(track),
  deleteStoredTrack: (id: string) => mockDeleteStoredTrack(id),
  getStoredTrackIds: () => mockGetStoredTrackIds(),
}));

const mockDeleteMarkers = jest.fn<Promise<void>, [string]>();
const mockDeleteProfilesForTrack = jest.fn<Promise<void>, [string]>();

jest.mock('../markerStore.web', () => ({
  deleteMarkers: (id: string) => mockDeleteMarkers(id),
  deleteProfilesForTrack: (id: string) => mockDeleteProfilesForTrack(id),
}));

const mockGetObjectUrl = jest.fn<Promise<string | null>, [string]>();
const mockRevokeObjectUrl = jest.fn();
const mockDeleteBlob = jest.fn<Promise<void>, [string]>();
const mockListBlobIds = jest.fn<Promise<string[]>, []>();
const mockSpareAwaitingMetadata = jest.fn<boolean, [string]>();
const mockReleaseImportedBlob = jest.fn();

jest.mock('../webBlobStore.web', () => ({
  getObjectUrl: (id: string) => mockGetObjectUrl(id),
  revokeObjectUrl: (id: string) => mockRevokeObjectUrl(id),
  deleteBlob: (id: string) => mockDeleteBlob(id),
  listBlobIds: () => mockListBlobIds(),
  spareAwaitingMetadata: (id: string) => mockSpareAwaitingMetadata(id),
  releaseImportedBlob: (id: string) => mockReleaseImportedBlob(id),
}));

const sampleTrack: Track = {
  id: 'track-1',
  filename: 'song.mp3',
  uri: 'blob:obj/track-1',
  format: 'mp3',
  durationMs: 42_000,
  durationEstimated: true,
  fileSizeBytes: 1_000_000,
  importedAt: 1_700_000_000_000,
  folderId: null,
  isFavorite: false,
  lastPlayedAt: null,
};

function storedRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'track-1',
    filename: 'song.mp3',
    format: 'mp3',
    durationMs: 42_000,
    durationEstimated: true,
    fileSizeBytes: 1_000_000,
    importedAt: 1_700_000_000_000,
    folderId: null,
    isFavorite: false,
    lastPlayedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllStoredTracks.mockResolvedValue([]);
  mockGetStoredTrack.mockResolvedValue(null);
  mockPutStoredTrack.mockResolvedValue(undefined);
  mockDeleteStoredTrack.mockResolvedValue(undefined);
  mockGetStoredTrackIds.mockResolvedValue([]);
  mockGetObjectUrl.mockResolvedValue('blob:obj/track-1');
  mockDeleteBlob.mockResolvedValue(undefined);
  mockListBlobIds.mockResolvedValue([]);
  mockDeleteMarkers.mockResolvedValue(undefined);
  mockDeleteProfilesForTrack.mockResolvedValue(undefined);
  // Default: no import in flight, so the sweep treats every unmatched blob
  // as a genuine orphan.
  mockSpareAwaitingMetadata.mockReturnValue(false);
});

describe('loadTracks', () => {
  it('resolves each row to a track with a playable object URL', async () => {
    mockGetAllStoredTracks.mockResolvedValue([storedRow()]);
    const tracks = await loadTracks();
    expect(tracks).toEqual([sampleTrack]);
    expect(tracks[0].uri).toBe('blob:obj/track-1');
    expect(mockGetObjectUrl).toHaveBeenCalledWith('track-1');
  });

  it('falls back to the sentinel uri when the blob is missing', async () => {
    mockGetAllStoredTracks.mockResolvedValue([storedRow()]);
    mockGetObjectUrl.mockResolvedValue(null);
    const tracks = await loadTracks();
    expect(tracks[0].uri).toBe('idb://track-1');
  });

  it('does not reject when orphan cleanup throws', async () => {
    mockGetAllStoredTracks.mockResolvedValue([storedRow()]);
    mockGetStoredTrackIds.mockRejectedValue(new Error('idb broken'));
    await expect(loadTracks()).resolves.toBeDefined();
  });

  it('returns tracks newest first', async () => {
    mockGetAllStoredTracks.mockResolvedValue([
      storedRow({ id: 'old', importedAt: 1 }),
      storedRow({ id: 'new', importedAt: 2 }),
    ]);
    const tracks = await loadTracks();
    expect(tracks.map((t) => t.id)).toEqual(['new', 'old']);
  });
});

describe('getTrack', () => {
  it('mints a fresh object URL for the stored row', async () => {
    mockGetStoredTrack.mockResolvedValue(storedRow());
    mockGetObjectUrl.mockResolvedValue('blob:obj/track-1');

    await expect(getTrack('track-1')).resolves.toEqual(sampleTrack);
    expect(mockGetObjectUrl).toHaveBeenCalledWith('track-1');
  });

  it('returns null when the id is not in the library', async () => {
    mockGetStoredTrack.mockResolvedValue(null);
    await expect(getTrack('missing')).resolves.toBeNull();
  });

  it('falls back to the sentinel uri when the audio blob is gone', async () => {
    mockGetStoredTrack.mockResolvedValue(storedRow());
    mockGetObjectUrl.mockResolvedValue(null);

    const track = await getTrack('track-1');
    expect(track?.uri).toBe('idb://track-1');
  });
});

describe('insertTrack', () => {
  it('persists the track metadata without the volatile uri', async () => {
    await insertTrack(sampleTrack);
    expect(mockPutStoredTrack).toHaveBeenCalledWith({
      id: 'track-1',
      filename: 'song.mp3',
      format: 'mp3',
      durationMs: 42_000,
      durationEstimated: true,
      fileSizeBytes: 1_000_000,
      importedAt: 1_700_000_000_000,
      folderId: null,
      isFavorite: false,
      lastPlayedAt: null,
    });
  });
});

describe('renameTrack', () => {
  it('re-persists the row with only the filename replaced', async () => {
    mockGetStoredTrack.mockResolvedValue(storedRow());

    await renameTrack('track-1', 'Practice take.mp3');

    expect(mockPutStoredTrack).toHaveBeenCalledWith({
      id: 'track-1',
      filename: 'Practice take.mp3',
      format: 'mp3',
      durationMs: 42_000,
      durationEstimated: true,
      fileSizeBytes: 1_000_000,
      importedAt: 1_700_000_000_000,
      folderId: null,
      isFavorite: false,
      lastPlayedAt: null,
    });
  });

  it('carries an already-measured duration through unchanged', async () => {
    mockGetStoredTrack.mockResolvedValue(
      storedRow({ durationMs: 45_000, durationEstimated: false }),
    );

    await renameTrack('track-1', 'Practice take.mp3');

    expect(mockPutStoredTrack).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 45_000, durationEstimated: false }),
    );
  });

  it('leaves the audio blob, markers and profiles alone', async () => {
    mockGetStoredTrack.mockResolvedValue(storedRow());

    await renameTrack('track-1', 'Practice take.mp3');

    expect(mockDeleteBlob).not.toHaveBeenCalled();
    expect(mockRevokeObjectUrl).not.toHaveBeenCalled();
    expect(mockDeleteMarkers).not.toHaveBeenCalled();
    expect(mockDeleteProfilesForTrack).not.toHaveBeenCalled();
  });

  // Writing here would create a metadata record with no audio behind it.
  it('does nothing when the track is absent', async () => {
    mockGetStoredTrack.mockResolvedValue(null);
    await renameTrack('missing', 'Practice take.mp3');
    expect(mockPutStoredTrack).not.toHaveBeenCalled();
  });
});

describe('updateTrackDuration', () => {
  it('updates duration and marks as not estimated on the stored row', async () => {
    mockGetStoredTrack.mockResolvedValue(storedRow());
    await updateTrackDuration('track-1', 45_000);
    expect(mockPutStoredTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'track-1',
        durationMs: 45_000,
        durationEstimated: false,
      }),
    );
  });

  it('does nothing when the track is absent', async () => {
    mockGetStoredTrack.mockResolvedValue(null);
    await updateTrackDuration('missing', 45_000);
    expect(mockPutStoredTrack).not.toHaveBeenCalled();
  });
});

describe('deleteTrack', () => {
  it('deletes the row, markers, profiles, revokes the URL, and removes the blob', async () => {
    await deleteTrack('track-1');
    expect(mockDeleteStoredTrack).toHaveBeenCalledWith('track-1');
    expect(mockDeleteMarkers).toHaveBeenCalledWith('track-1');
    expect(mockDeleteProfilesForTrack).toHaveBeenCalledWith('track-1');
    expect(mockRevokeObjectUrl).toHaveBeenCalledWith('track-1');
    expect(mockDeleteBlob).toHaveBeenCalledWith('track-1');
  });

  it('does not reject when the blob delete rejects', async () => {
    mockDeleteBlob.mockRejectedValue(new Error('idb gone'));
    await expect(deleteTrack('track-1')).resolves.toBeUndefined();
    // Let the fire-and-forget rejection settle without surfacing.
    await Promise.resolve();
  });
});

describe('cleanupOrphanFiles', () => {
  it('deletes blobs whose id is not in the metadata store', async () => {
    mockGetStoredTrackIds.mockResolvedValue(['track-1']);
    mockListBlobIds.mockResolvedValue(['track-1', 'orphan']);

    const removed = await cleanupOrphanFiles();
    expect(removed).toBe(1);
    expect(mockDeleteBlob).toHaveBeenCalledWith('orphan');
    expect(mockDeleteBlob).not.toHaveBeenCalledWith('track-1');
  });

  it('returns 0 when there are no orphans', async () => {
    mockGetStoredTrackIds.mockResolvedValue(['track-1']);
    mockListBlobIds.mockResolvedValue(['track-1']);
    expect(await cleanupOrphanFiles()).toBe(0);
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  // An import writes the blob before the track record, so mid-import the
  // blob looks exactly like an orphan. The sweep runs on every library load
  // — including one triggered while the import is still in flight — and
  // deleting here would strip the audio from the track just added.
  it('spares a blob whose import has not written its record yet', async () => {
    mockGetStoredTrackIds.mockResolvedValue([]);
    mockListBlobIds.mockResolvedValue(['importing']);
    mockSpareAwaitingMetadata.mockImplementation((id) => id === 'importing');

    const removed = await cleanupOrphanFiles();

    expect(removed).toBe(0);
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('stops sparing a blob once its record exists', async () => {
    mockGetStoredTrackIds.mockResolvedValue(['imported']);
    mockListBlobIds.mockResolvedValue(['imported']);

    await cleanupOrphanFiles();

    expect(mockReleaseImportedBlob).toHaveBeenCalledWith('imported');
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  // The known ids must be read after the blob listing, or a record written
  // while the listing was in flight would be missed and its blob deleted.
  it('reads the known ids after listing the blobs', async () => {
    const order: string[] = [];
    mockListBlobIds.mockImplementation(async () => {
      order.push('list');
      return ['track-1'];
    });
    mockGetStoredTrackIds.mockImplementation(async () => {
      order.push('known');
      return ['track-1'];
    });

    await cleanupOrphanFiles();

    expect(order).toEqual(['list', 'known']);
  });

  // loadTracks fires a sweep on every library load and never awaits it, so two
  // could otherwise overlap and race each other's protection marks.
  it('runs one sweep at a time', async () => {
    let releaseList: (ids: string[]) => void = () => undefined;
    mockListBlobIds.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          releaseList = resolve;
        }),
    );

    const first = cleanupOrphanFiles();
    const second = cleanupOrphanFiles();
    releaseList([]);
    await Promise.all([first, second]);

    expect(mockListBlobIds).toHaveBeenCalledTimes(1);
  });

  it('returns 0 and swallows errors when listing fails', async () => {
    mockGetStoredTrackIds.mockResolvedValue([]);
    mockListBlobIds.mockRejectedValue(new Error('idb unavailable'));
    expect(await cleanupOrphanFiles()).toBe(0);
  });
});

describe('loadTracks scopes', () => {
  const rows = [
    storedRow({
      id: 'a',
      importedAt: 30,
      folderId: 'folder-1',
      isFavorite: true,
    }),
    storedRow({ id: 'b', importedAt: 10, folderId: null, isFavorite: false }),
    storedRow({
      id: 'c',
      importedAt: 20,
      folderId: 'folder-2',
      isFavorite: true,
    }),
  ];

  it('returns every track newest first by default', async () => {
    mockGetAllStoredTracks.mockResolvedValue(rows);

    const tracks = await loadTracks();

    expect(tracks.map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });

  it('returns only starred tracks in the favourites scope', async () => {
    mockGetAllStoredTracks.mockResolvedValue(rows);

    const tracks = await loadTracks({ scope: 'favorites' });

    expect(tracks.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('returns tracks in no folder in the unfiled scope', async () => {
    mockGetAllStoredTracks.mockResolvedValue(rows);

    const tracks = await loadTracks({ scope: 'unfiled' });

    expect(tracks.map((t) => t.id)).toEqual(['b']);
  });

  it('returns one folder in the folder scope', async () => {
    mockGetAllStoredTracks.mockResolvedValue(rows);

    const tracks = await loadTracks({ scope: 'folder', folderId: 'folder-2' });

    expect(tracks.map((t) => t.id)).toEqual(['c']);
  });

  it('defaults the favourite and play-time fields on a pre-migration row', async () => {
    const legacy = storedRow();
    delete (legacy as Record<string, unknown>).isFavorite;
    delete (legacy as Record<string, unknown>).lastPlayedAt;
    mockGetAllStoredTracks.mockResolvedValue([legacy]);

    const tracks = await loadTracks();

    expect(tracks[0].isFavorite).toBe(false);
    expect(tracks[0].lastPlayedAt).toBeNull();
  });
});

describe('setTrackFavorite', () => {
  it('re-persists the row with the favourite flag flipped', async () => {
    mockGetStoredTrack.mockResolvedValue(storedRow());

    await setTrackFavorite('track-1', true);

    expect(mockPutStoredTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1', isFavorite: true }),
    );
  });

  it('is a no-op for an unknown id', async () => {
    mockGetStoredTrack.mockResolvedValue(null);

    await setTrackFavorite('missing', true);

    expect(mockPutStoredTrack).not.toHaveBeenCalled();
  });
});

describe('markTrackPlayed', () => {
  it('records the timestamp the caller supplies', async () => {
    mockGetStoredTrack.mockResolvedValue(storedRow());

    await markTrackPlayed('track-1', 1_700_000_900_000);

    expect(mockPutStoredTrack).toHaveBeenCalledWith(
      expect.objectContaining({ lastPlayedAt: 1_700_000_900_000 }),
    );
  });

  it('is a no-op for an unknown id', async () => {
    mockGetStoredTrack.mockResolvedValue(null);

    await markTrackPlayed('missing', 1);

    expect(mockPutStoredTrack).not.toHaveBeenCalled();
  });
});

describe('getTrackCountsByFolder', () => {
  it('counts per folder alongside all, favourites and unfiled', async () => {
    mockGetAllStoredTracks.mockResolvedValue([
      storedRow({ id: 'a', folderId: 'folder-1', isFavorite: true }),
      storedRow({ id: 'b', folderId: 'folder-1', isFavorite: false }),
      storedRow({ id: 'c', folderId: null, isFavorite: true }),
    ]);

    await expect(getTrackCountsByFolder()).resolves.toEqual({
      byFolder: { 'folder-1': 2 },
      all: 3,
      favorites: 2,
      unfiled: 1,
    });
  });

  // IndexedDB stores whatever it is handed, so a record could arrive carrying
  // the native side's numeric encoding. The tally and the list it opens have
  // to agree about it, or the badge shows a count the list cannot show.
  it('agrees with the favourites list about a numerically-flagged record', async () => {
    const rows = [
      storedRow({ id: 'a', folderId: null, isFavorite: 1 }),
      storedRow({ id: 'b', folderId: null, isFavorite: 0 }),
    ];
    mockGetAllStoredTracks.mockResolvedValue(rows);

    const counts = await getTrackCountsByFolder();
    mockGetAllStoredTracks.mockResolvedValue(rows);
    const listed = await loadTracks({ scope: 'favorites' });

    expect(counts.favorites).toBe(listed.length);
    expect(listed.map((t) => t.id)).toEqual(['a']);
  });

  it('reports zeroes for an empty library', async () => {
    mockGetAllStoredTracks.mockResolvedValue([]);

    await expect(getTrackCountsByFolder()).resolves.toEqual({
      byFolder: {},
      all: 0,
      favorites: 0,
      unfiled: 0,
    });
  });
});

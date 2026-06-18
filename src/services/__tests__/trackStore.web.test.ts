/**
 * @jest-environment node
 */
import { Track } from '../../types';
import {
  cleanupOrphanFiles,
  deleteTrack,
  insertTrack,
  loadTracks,
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

jest.mock('../markerStore.web', () => ({
  deleteMarkers: (id: string) => mockDeleteMarkers(id),
}));

const mockGetObjectUrl = jest.fn<Promise<string | null>, [string]>();
const mockRevokeObjectUrl = jest.fn();
const mockDeleteBlob = jest.fn<Promise<void>, [string]>();
const mockListBlobIds = jest.fn<Promise<string[]>, []>();

jest.mock('../webBlobStore.web', () => ({
  getObjectUrl: (id: string) => mockGetObjectUrl(id),
  revokeObjectUrl: (id: string) => mockRevokeObjectUrl(id),
  deleteBlob: (id: string) => mockDeleteBlob(id),
  listBlobIds: () => mockListBlobIds(),
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

  it('returns tracks newest first', async () => {
    mockGetAllStoredTracks.mockResolvedValue([
      storedRow({ id: 'old', importedAt: 1 }),
      storedRow({ id: 'new', importedAt: 2 }),
    ]);
    const tracks = await loadTracks();
    expect(tracks.map((t) => t.id)).toEqual(['new', 'old']);
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
    });
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
  it('deletes the row, markers, revokes the URL, and removes the blob', async () => {
    await deleteTrack('track-1');
    expect(mockDeleteStoredTrack).toHaveBeenCalledWith('track-1');
    expect(mockDeleteMarkers).toHaveBeenCalledWith('track-1');
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

  it('returns 0 and swallows errors when listing fails', async () => {
    mockGetStoredTrackIds.mockResolvedValue([]);
    mockListBlobIds.mockRejectedValue(new Error('idb unavailable'));
    expect(await cleanupOrphanFiles()).toBe(0);
  });
});

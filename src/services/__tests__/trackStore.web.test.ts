/**
 * @jest-environment node
 */
import { Track } from '../../types';

const mockRunSync = jest.fn();
const mockGetAllSync = jest.fn();

jest.mock('../database', () => ({
  getDatabase: jest.fn(() => ({
    runSync: mockRunSync,
    getAllSync: mockGetAllSync,
  })),
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

import {
  cleanupOrphanFiles,
  deleteTrack,
  insertTrack,
  loadTracks,
  updateTrackDuration,
} from '../trackStore.web';

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

function dbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'track-1',
    filename: 'song.mp3',
    uri: 'idb://track-1',
    format: 'mp3',
    durationMs: 42_000,
    durationEstimated: 1,
    fileSizeBytes: 1_000_000,
    importedAt: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetObjectUrl.mockResolvedValue('blob:obj/track-1');
  mockDeleteBlob.mockResolvedValue(undefined);
  mockListBlobIds.mockResolvedValue([]);
});

describe('loadTracks', () => {
  it('resolves each row to a track with a playable object URL', async () => {
    mockGetAllSync.mockReturnValue([dbRow()]);
    const tracks = await loadTracks();
    expect(tracks).toEqual([sampleTrack]);
    expect(tracks[0].uri).toBe('blob:obj/track-1');
    expect(mockGetObjectUrl).toHaveBeenCalledWith('track-1');
  });

  it('falls back to the sentinel uri when the blob is missing', async () => {
    mockGetAllSync.mockReturnValue([dbRow()]);
    mockGetObjectUrl.mockResolvedValue(null);
    const tracks = await loadTracks();
    expect(tracks[0].uri).toBe('idb://track-1');
  });

  it('converts durationEstimated 0 to false', async () => {
    mockGetAllSync.mockReturnValue([dbRow({ durationEstimated: 0 })]);
    const tracks = await loadTracks();
    expect(tracks[0].durationEstimated).toBe(false);
  });
});

describe('insertTrack', () => {
  it('persists the idb sentinel uri, not the volatile object URL', () => {
    insertTrack(sampleTrack);
    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tracks'),
      'track-1',
      'song.mp3',
      'idb://track-1',
      'mp3',
      42_000,
      1,
      1_000_000,
      1_700_000_000_000,
    );
  });
});

describe('updateTrackDuration', () => {
  it('updates duration and marks as not estimated', () => {
    updateTrackDuration('track-1', 45_000);
    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tracks SET durationMs'),
      45_000,
      'track-1',
    );
  });
});

describe('deleteTrack', () => {
  it('deletes the row, revokes the URL, and removes the blob', async () => {
    deleteTrack('track-1');
    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tracks'),
      'track-1',
    );
    expect(mockRevokeObjectUrl).toHaveBeenCalledWith('track-1');
    expect(mockDeleteBlob).toHaveBeenCalledWith('track-1');
  });

  it('does not throw when the blob delete rejects', async () => {
    mockDeleteBlob.mockRejectedValue(new Error('idb gone'));
    expect(() => deleteTrack('track-1')).not.toThrow();
    // Let the fire-and-forget rejection settle without surfacing.
    await Promise.resolve();
  });
});

describe('cleanupOrphanFiles', () => {
  it('deletes blobs whose id is not in the database', async () => {
    mockGetAllSync.mockReturnValue([{ id: 'track-1' }]);
    mockListBlobIds.mockResolvedValue(['track-1', 'orphan']);

    const removed = await cleanupOrphanFiles();
    expect(removed).toBe(1);
    expect(mockDeleteBlob).toHaveBeenCalledWith('orphan');
    expect(mockDeleteBlob).not.toHaveBeenCalledWith('track-1');
  });

  it('returns 0 when there are no orphans', async () => {
    mockGetAllSync.mockReturnValue([{ id: 'track-1' }]);
    mockListBlobIds.mockResolvedValue(['track-1']);
    expect(await cleanupOrphanFiles()).toBe(0);
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('returns 0 and swallows errors when listing fails', async () => {
    mockGetAllSync.mockReturnValue([]);
    mockListBlobIds.mockRejectedValue(new Error('idb unavailable'));
    expect(await cleanupOrphanFiles()).toBe(0);
  });
});

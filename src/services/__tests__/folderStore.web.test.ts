/**
 * @jest-environment node
 */
import {
  deleteFolder,
  getFolder,
  insertFolder,
  loadFolders,
  markFolderOpened,
  renameFolder,
  reorderPinnedFolders,
  setFolderPinned,
} from '../folderStore.web';

const mockGetAllStoredFolders = jest.fn();
const mockGetStoredFolder = jest.fn();
const mockPutStoredFolder = jest.fn<Promise<void>, unknown[]>();
const mockDeleteStoredFolder = jest.fn<Promise<void>, [string]>();
const mockGetAllStoredTracks = jest.fn();
const mockPutStoredTrack = jest.fn<Promise<void>, unknown[]>();

jest.mock('../database.web', () => ({
  getAllStoredFolders: () => mockGetAllStoredFolders(),
  getStoredFolder: (id: string) => mockGetStoredFolder(id),
  putStoredFolder: (folder: unknown) => mockPutStoredFolder(folder),
  deleteStoredFolder: (id: string) => mockDeleteStoredFolder(id),
  getAllStoredTracks: () => mockGetAllStoredTracks(),
  putStoredTrack: (track: unknown) => mockPutStoredTrack(track),
}));

function storedFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-1',
    name: 'Gigs',
    createdAt: 1_700_000_000_000,
    pinOrder: null,
    lastOpenedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllStoredFolders.mockResolvedValue([]);
  mockGetStoredFolder.mockResolvedValue(null);
  mockPutStoredFolder.mockResolvedValue(undefined);
  mockDeleteStoredFolder.mockResolvedValue(undefined);
  mockGetAllStoredTracks.mockResolvedValue([]);
  mockPutStoredTrack.mockResolvedValue(undefined);
});

describe('loadFolders', () => {
  it('puts the pinned block first, in pin order', async () => {
    mockGetAllStoredFolders.mockResolvedValue([
      storedFolder({ id: 'c', name: 'C', lastOpenedAt: 90 }),
      storedFolder({ id: 'b', name: 'B', pinOrder: 1 }),
      storedFolder({ id: 'a', name: 'A', pinOrder: 0 }),
    ]);

    const folders = await loadFolders();

    expect(folders.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders unpinned folders by most recently opened', async () => {
    mockGetAllStoredFolders.mockResolvedValue([
      storedFolder({ id: 'old', name: 'Old', lastOpenedAt: 10 }),
      storedFolder({ id: 'new', name: 'New', lastOpenedAt: 30 }),
      storedFolder({ id: 'mid', name: 'Mid', lastOpenedAt: 20 }),
    ]);

    const folders = await loadFolders();

    expect(folders.map((f) => f.id)).toEqual(['new', 'mid', 'old']);
  });

  it('puts never-opened folders last, alphabetically among themselves', async () => {
    mockGetAllStoredFolders.mockResolvedValue([
      storedFolder({ id: 'z', name: 'Zebra', lastOpenedAt: null }),
      storedFolder({ id: 'a', name: 'Anthem', lastOpenedAt: null }),
      storedFolder({ id: 'opened', name: 'Opened', lastOpenedAt: 1 }),
    ]);

    const folders = await loadFolders();

    expect(folders.map((f) => f.id)).toEqual(['opened', 'a', 'z']);
  });

  it('falls back to name when two folders were opened at the same moment', async () => {
    mockGetAllStoredFolders.mockResolvedValue([
      storedFolder({ id: 'b', name: 'Bravo', lastOpenedAt: 5 }),
      storedFolder({ id: 'a', name: 'Alpha', lastOpenedAt: 5 }),
    ]);

    const folders = await loadFolders();

    expect(folders.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('defaults the pin and open-time fields on a pre-migration record', async () => {
    const legacy = storedFolder();
    delete (legacy as Record<string, unknown>).pinOrder;
    delete (legacy as Record<string, unknown>).lastOpenedAt;
    mockGetAllStoredFolders.mockResolvedValue([legacy]);

    const folders = await loadFolders();

    expect(folders[0].pinOrder).toBeNull();
    expect(folders[0].lastOpenedAt).toBeNull();
  });
});

describe('getFolder', () => {
  it('returns the folder for an id', async () => {
    mockGetStoredFolder.mockResolvedValue(storedFolder({ lastOpenedAt: 7 }));

    await expect(getFolder('folder-1')).resolves.toEqual({
      id: 'folder-1',
      name: 'Gigs',
      createdAt: 1_700_000_000_000,
      pinOrder: null,
      lastOpenedAt: 7,
    });
  });

  it('returns null when the id is unknown', async () => {
    await expect(getFolder('missing')).resolves.toBeNull();
  });
});

describe('insertFolder', () => {
  it('stamps lastOpenedAt from createdAt so a new folder sorts to the top', async () => {
    await insertFolder({
      id: 'folder-1',
      name: 'Gigs',
      createdAt: 1_700_000_000_000,
      pinOrder: null,
      lastOpenedAt: null,
    });

    expect(mockPutStoredFolder).toHaveBeenCalledWith({
      id: 'folder-1',
      name: 'Gigs',
      createdAt: 1_700_000_000_000,
      pinOrder: null,
      lastOpenedAt: 1_700_000_000_000,
    });
  });

  it('keeps an explicit lastOpenedAt', async () => {
    await insertFolder({
      id: 'folder-1',
      name: 'Gigs',
      createdAt: 1_700_000_000_000,
      pinOrder: null,
      lastOpenedAt: 42,
    });

    expect(mockPutStoredFolder).toHaveBeenCalledWith(
      expect.objectContaining({ lastOpenedAt: 42 }),
    );
  });
});

describe('renameFolder', () => {
  it('re-persists the record with only the name replaced', async () => {
    mockGetStoredFolder.mockResolvedValue(storedFolder({ pinOrder: 3 }));

    await renameFolder('folder-1', 'Rehearsals');

    expect(mockPutStoredFolder).toHaveBeenCalledWith({
      id: 'folder-1',
      name: 'Rehearsals',
      createdAt: 1_700_000_000_000,
      pinOrder: 3,
      lastOpenedAt: null,
    });
  });

  it('is a no-op for an unknown id', async () => {
    await renameFolder('missing', 'Rehearsals');

    expect(mockPutStoredFolder).not.toHaveBeenCalled();
  });
});

describe('deleteFolder', () => {
  it('moves the folder tracks to unfiled and removes the folder', async () => {
    mockGetStoredFolder.mockResolvedValue(storedFolder());
    mockGetAllStoredTracks.mockResolvedValue([
      { id: 'track-1', folderId: 'folder-1' },
      { id: 'track-2', folderId: 'other' },
    ]);

    await deleteFolder('folder-1');

    expect(mockPutStoredTrack).toHaveBeenCalledTimes(1);
    expect(mockPutStoredTrack).toHaveBeenCalledWith({
      id: 'track-1',
      folderId: null,
    });
    expect(mockDeleteStoredFolder).toHaveBeenCalledWith('folder-1');
  });

  it('is a no-op for an unknown id', async () => {
    await deleteFolder('missing');

    expect(mockDeleteStoredFolder).not.toHaveBeenCalled();
    expect(mockPutStoredTrack).not.toHaveBeenCalled();
  });
});

describe('setFolderPinned', () => {
  it('pins a folder at the given position', async () => {
    mockGetStoredFolder.mockResolvedValue(storedFolder());

    await setFolderPinned('folder-1', 2);

    expect(mockPutStoredFolder).toHaveBeenCalledWith(
      expect.objectContaining({ pinOrder: 2 }),
    );
  });

  it('unpins a folder when the position is null', async () => {
    mockGetStoredFolder.mockResolvedValue(storedFolder({ pinOrder: 2 }));

    await setFolderPinned('folder-1', null);

    expect(mockPutStoredFolder).toHaveBeenCalledWith(
      expect.objectContaining({ pinOrder: null }),
    );
  });

  it('is a no-op for an unknown id', async () => {
    await setFolderPinned('missing', 1);

    expect(mockPutStoredFolder).not.toHaveBeenCalled();
  });
});

describe('reorderPinnedFolders', () => {
  it('writes each listed id at its index and unpins the rest', async () => {
    mockGetAllStoredFolders.mockResolvedValue([
      storedFolder({ id: 'a', pinOrder: 5 }),
      storedFolder({ id: 'b', pinOrder: null }),
      storedFolder({ id: 'dropped', pinOrder: 1 }),
    ]);

    await reorderPinnedFolders(['b', 'a']);

    expect(mockPutStoredFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b', pinOrder: 0 }),
    );
    expect(mockPutStoredFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', pinOrder: 1 }),
    );
    expect(mockPutStoredFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dropped', pinOrder: null }),
    );
  });

  it('leaves records whose position is already correct alone', async () => {
    mockGetAllStoredFolders.mockResolvedValue([
      storedFolder({ id: 'a', pinOrder: 0 }),
      storedFolder({ id: 'b', pinOrder: null }),
    ]);

    await reorderPinnedFolders(['a']);

    expect(mockPutStoredFolder).not.toHaveBeenCalled();
  });
});

describe('markFolderOpened', () => {
  it('records the timestamp the caller supplies', async () => {
    mockGetStoredFolder.mockResolvedValue(storedFolder());

    await markFolderOpened('folder-1', 1_700_000_900_000);

    expect(mockPutStoredFolder).toHaveBeenCalledWith(
      expect.objectContaining({ lastOpenedAt: 1_700_000_900_000 }),
    );
  });

  it('is a no-op for an unknown id', async () => {
    await markFolderOpened('missing', 1);

    expect(mockPutStoredFolder).not.toHaveBeenCalled();
  });
});

/* eslint-disable @typescript-eslint/no-require-imports */
import { Folder } from '../../types';

const mockRunSync = jest.fn();
const mockGetAllSync = jest.fn();
const mockGetFirstSync = jest.fn();
const mockExecSync = jest.fn();
const mockCloseSync = jest.fn();
const mockWithTransactionSync = jest.fn((task: () => void) => task());

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    runSync: mockRunSync,
    getAllSync: mockGetAllSync,
    getFirstSync: mockGetFirstSync,
    execSync: mockExecSync,
    closeSync: mockCloseSync,
    withTransactionSync: mockWithTransactionSync,
  })),
}));

const sampleFolder: Folder = {
  id: 'folder-1',
  name: 'Gigs',
  createdAt: 1_700_000_000_000,
  pinOrder: null,
  lastOpenedAt: null,
};

/**
 * Opening the database runs both schema migrations, which read the table
 * columns and check whether the one-off folder flatten has already run.
 * Answering both here keeps that machinery out of the way, so each test only
 * sees the statement it is about.
 */
beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  mockGetAllSync.mockReturnValue([]);
  mockGetFirstSync.mockReturnValue({ value: '1' });
  mockWithTransactionSync.mockImplementation((task: () => void) => task());
});

describe('loadFolders', () => {
  it('orders pinned folders first, then most recently opened, then by name', () => {
    const { loadFolders } = require('../folderStore');
    loadFolders();

    const sql = mockGetAllSync.mock.calls.at(-1)![0] as string;
    expect(sql).toContain('FROM folders');
    // Pinned before unpinned, and opened before never-opened: SQLite sorts
    // NULL first by default, so both have to be stated rather than assumed.
    expect(sql).toContain('CASE WHEN pinOrder IS NULL THEN 1 ELSE 0 END ASC');
    expect(sql).toContain('pinOrder ASC');
    expect(sql).toContain(
      'CASE WHEN lastOpenedAt IS NULL THEN 1 ELSE 0 END ASC',
    );
    expect(sql).toContain('lastOpenedAt DESC');
    expect(sql).toContain('name ASC');
  });

  it('maps rows to folders, defaulting the pin and open-time fields', () => {
    mockGetAllSync.mockReturnValue([
      { id: 'folder-1', name: 'Gigs', createdAt: 1, pinOrder: 0 },
    ]);

    const { loadFolders } = require('../folderStore');

    expect(loadFolders()).toEqual([
      {
        id: 'folder-1',
        name: 'Gigs',
        createdAt: 1,
        pinOrder: 0,
        lastOpenedAt: null,
      },
    ]);
  });
});

describe('getFolder', () => {
  it('returns the folder for an id', () => {
    mockGetFirstSync.mockReturnValue({
      id: 'folder-1',
      name: 'Gigs',
      createdAt: 1,
      pinOrder: null,
      lastOpenedAt: 5,
    });

    const { getFolder } = require('../folderStore');

    expect(getFolder('folder-1')).toEqual({
      id: 'folder-1',
      name: 'Gigs',
      createdAt: 1,
      pinOrder: null,
      lastOpenedAt: 5,
    });
  });

  it('returns null when the id is unknown', () => {
    mockGetFirstSync.mockImplementation((sql: string) =>
      sql.includes('settings') ? { value: '1' } : undefined,
    );

    const { getFolder } = require('../folderStore');

    expect(getFolder('missing')).toBeNull();
  });
});

describe('insertFolder', () => {
  it('stamps lastOpenedAt from createdAt so a new folder sorts to the top', () => {
    const { insertFolder } = require('../folderStore');
    insertFolder(sampleFolder);

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO folders'),
      'folder-1',
      'Gigs',
      1_700_000_000_000,
      null,
      1_700_000_000_000,
    );
  });

  it('keeps an explicit lastOpenedAt', () => {
    const { insertFolder } = require('../folderStore');
    insertFolder({ ...sampleFolder, lastOpenedAt: 42 });

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO folders'),
      'folder-1',
      'Gigs',
      1_700_000_000_000,
      null,
      42,
    );
  });

  it('does not write the retired parentId or sortOrder columns', () => {
    const { insertFolder } = require('../folderStore');
    insertFolder(sampleFolder);

    const sql = mockRunSync.mock.calls[0][0] as string;
    expect(sql).not.toContain('parentId');
    expect(sql).not.toContain('sortOrder');
  });
});

describe('renameFolder', () => {
  it('updates only the name column', () => {
    const { renameFolder } = require('../folderStore');
    renameFolder('folder-1', 'Rehearsals');

    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE folders SET name = ? WHERE id = ?',
      'Rehearsals',
      'folder-1',
    );
  });
});

describe('deleteFolder', () => {
  it('moves the folder tracks to unfiled rather than to a parent', () => {
    const { deleteFolder } = require('../folderStore');
    deleteFolder('folder-1');

    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE tracks SET folderId = NULL WHERE folderId = ?',
      'folder-1',
    );
    expect(mockRunSync).toHaveBeenCalledWith(
      'DELETE FROM folders WHERE id = ?',
      'folder-1',
    );
  });

  it('never reparents anything, since folders no longer nest', () => {
    const { deleteFolder } = require('../folderStore');
    deleteFolder('folder-1');

    for (const [sql] of mockRunSync.mock.calls) {
      expect(sql as string).not.toContain('parentId');
    }
  });
});

describe('setFolderPinned', () => {
  it('pins a folder at the given position', () => {
    const { setFolderPinned } = require('../folderStore');
    setFolderPinned('folder-1', 2);

    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE folders SET pinOrder = ? WHERE id = ?',
      2,
      'folder-1',
    );
  });

  it('unpins a folder when the position is null', () => {
    const { setFolderPinned } = require('../folderStore');
    setFolderPinned('folder-1', null);

    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE folders SET pinOrder = ? WHERE id = ?',
      null,
      'folder-1',
    );
  });
});

describe('reorderPinnedFolders', () => {
  it('clears the block then writes each id at its index, in one transaction', () => {
    const { reorderPinnedFolders } = require('../folderStore');
    reorderPinnedFolders(['b', 'a']);

    expect(mockWithTransactionSync).toHaveBeenCalledTimes(1);
    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE folders SET pinOrder = NULL WHERE pinOrder IS NOT NULL',
    );
    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE folders SET pinOrder = ? WHERE id = ?',
      0,
      'b',
    );
    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE folders SET pinOrder = ? WHERE id = ?',
      1,
      'a',
    );
  });

  it('unpins everything when the list is empty', () => {
    const { reorderPinnedFolders } = require('../folderStore');
    reorderPinnedFolders([]);

    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE folders SET pinOrder = NULL WHERE pinOrder IS NOT NULL',
    );
    expect(mockRunSync).toHaveBeenCalledTimes(1);
  });
});

describe('markFolderOpened', () => {
  it('records the timestamp the caller supplies', () => {
    const { markFolderOpened } = require('../folderStore');
    markFolderOpened('folder-1', 1_700_000_900_000);

    expect(mockRunSync).toHaveBeenCalledWith(
      'UPDATE folders SET lastOpenedAt = ? WHERE id = ?',
      1_700_000_900_000,
      'folder-1',
    );
  });
});

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

/**
 * Display order is decided by the ORDER BY clause, so a test that reads the
 * SQL back proves only that the clause was written, not that it sorts the
 * way it is meant to: swapping two clauses, or an equally plausible reading
 * of how SQLite handles NULL, would go unnoticed. These run the real query
 * against a real engine instead.
 *
 * The engine is Node's own built-in SQLite (Node 22.5 and later), so this
 * costs no dependency. The expo-sqlite mock is pointed at it for the length
 * of this block and reset afterwards.
 */
describe('loadFolders display order, against a real SQL engine', () => {
  /** The slice of Node's `DatabaseSync` these tests use. */
  interface RealDatabase {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): unknown;
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
    close(): void;
  }

  let real: RealDatabase;

  beforeEach(() => {
    const { DatabaseSync } = require('node:sqlite');
    real = new DatabaseSync(':memory:');
    mockExecSync.mockImplementation((sql: string) => real.exec(sql));
    mockRunSync.mockImplementation((sql: string, ...params: unknown[]) =>
      real.prepare(sql).run(...params),
    );
    mockGetAllSync.mockImplementation((sql: string, ...params: unknown[]) =>
      real.prepare(sql).all(...params),
    );
    mockGetFirstSync.mockImplementation((sql: string, ...params: unknown[]) =>
      real.prepare(sql).get(...params),
    );
  });

  afterEach(() => {
    mockExecSync.mockReset();
    mockRunSync.mockReset();
    mockGetAllSync.mockReset();
    mockGetFirstSync.mockReset();
    real.close();
  });

  /**
   * Writes a folder row directly, bypassing `insertFolder` — which stamps
   * an open time on anything that arrives without one, so it cannot produce
   * the never-opened rows these tests are partly about.
   */
  function seedFolder(row: {
    id: string;
    name: string;
    pinOrder: number | null;
    lastOpenedAt: number | null;
  }): void {
    real
      .prepare(
        'INSERT INTO folders (id, name, parentId, createdAt, sortOrder, pinOrder, lastOpenedAt) VALUES (?, ?, NULL, ?, 0, ?, ?)',
      )
      .run(row.id, row.name, 1, row.pinOrder, row.lastOpenedAt);
  }

  function namesInOrder(): string[] {
    const { loadFolders } = require('../folderStore');
    // The first read creates the schema; seed against it, then read for real.
    loadFolders();
    seedFolder({
      id: 'zebra',
      name: 'Zebra',
      pinOrder: null,
      lastOpenedAt: null,
    });
    seedFolder({
      id: 'anthem',
      name: 'anthem',
      pinOrder: null,
      lastOpenedAt: null,
    });
    seedFolder({
      id: 'older',
      name: 'Older',
      pinOrder: null,
      lastOpenedAt: 100,
    });
    seedFolder({
      id: 'recent',
      name: 'Recent',
      pinOrder: null,
      lastOpenedAt: 500,
    });
    seedFolder({
      id: 'pin-second',
      name: 'Second',
      pinOrder: 1,
      lastOpenedAt: null,
    });
    seedFolder({
      id: 'pin-first',
      name: 'First',
      pinOrder: 0,
      lastOpenedAt: 900,
    });
    return loadFolders().map((folder: Folder) => folder.name);
  }

  it('puts the pinned block first, in its own hand-arranged order', () => {
    expect(namesInOrder().slice(0, 2)).toEqual(['First', 'Second']);
  });

  it('orders unpinned folders by most recently opened', () => {
    expect(namesInOrder().slice(2, 4)).toEqual(['Recent', 'Older']);
  });

  it('leaves never-opened folders last, ordered by name whatever their case', () => {
    // Byte order would put every capital before every lowercase letter, so
    // 'Zebra' would come first — which is not what the web side does.
    expect(namesInOrder().slice(4)).toEqual(['anthem', 'Zebra']);
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

  // The column list and its placeholders are derived from one array, so they
  // cannot drift apart when a sixth column is added later.
  it('binds one placeholder, and one argument, per column', () => {
    const { insertFolder } = require('../folderStore');
    insertFolder(sampleFolder);

    const [sql, ...params] = mockRunSync.mock.calls[0];
    const groups = /\(([^)]*)\)[^(]*\(([^)]*)\)/.exec(sql as string);
    expect(groups).not.toBeNull();
    const columnCount = groups![1].split(',').length;

    expect(groups![2].split(',')).toHaveLength(columnCount);
    expect(params).toHaveLength(columnCount);
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

import * as SQLite from 'expo-sqlite';
import { getDatabase, closeDatabase } from '../database';

const mockGetAllSync = jest.fn();
const mockGetFirstSync = jest.fn();
const mockRunSync = jest.fn();
const mockExecSync = jest.fn();
const mockCloseSync = jest.fn();

jest.mock('expo-sqlite', () => ({
  // Defined inline so the factory does not depend on a not-yet-initialised
  // outer variable (jest hoists this above the const declarations above).
  openDatabaseSync: jest.fn(() => ({
    getAllSync: mockGetAllSync,
    getFirstSync: mockGetFirstSync,
    runSync: mockRunSync,
    execSync: mockExecSync,
    closeSync: mockCloseSync,
  })),
}));

const mockOpenDatabaseSync = SQLite.openDatabaseSync as jest.Mock;

const ALTER_SQL =
  'ALTER TABLE tracks ADD COLUMN durationEstimated INTEGER NOT NULL DEFAULT 1;';

const URI_MIGRATION_SQL = `UPDATE tracks SET uri = 'tracks/' || id || '.' || format WHERE uri LIKE 'file://%';`;

const FLATTEN_KEY = 'migration.foldersFlattened';

const ALTER_PIN_ORDER =
  'ALTER TABLE folders ADD COLUMN pinOrder INTEGER DEFAULT NULL;';
const ALTER_LAST_OPENED =
  'ALTER TABLE folders ADD COLUMN lastOpenedAt INTEGER DEFAULT NULL;';
const FLATTEN_SQL = 'UPDATE folders SET parentId = NULL;';
const BACKFILL_OPENED_SQL =
  'UPDATE folders SET lastOpenedAt = createdAt WHERE lastOpenedAt IS NULL;';

/** Columns present on a current-schema `tracks` table. */
const FRESH_COLUMNS = [
  { name: 'id' },
  { name: 'filename' },
  { name: 'uri' },
  { name: 'format' },
  { name: 'durationMs' },
  { name: 'durationEstimated' },
  { name: 'fileSizeBytes' },
  { name: 'importedAt' },
  { name: 'isFavorite' },
  { name: 'lastPlayedAt' },
];

/** Columns on a legacy database created before durationEstimated existed. */
const LEGACY_COLUMNS = FRESH_COLUMNS.filter(
  (column) => column.name !== 'durationEstimated',
);

/** Columns present on a current-schema `folders` table. */
const FRESH_FOLDER_COLUMNS = [
  { name: 'id' },
  { name: 'name' },
  { name: 'parentId' },
  { name: 'createdAt' },
  { name: 'sortOrder' },
  { name: 'pinOrder' },
  { name: 'lastOpenedAt' },
];

/** Columns on a folders table created before pinning and open-time existed. */
const LEGACY_FOLDER_COLUMNS = FRESH_FOLDER_COLUMNS.filter(
  (column) => column.name !== 'pinOrder' && column.name !== 'lastOpenedAt',
);

/**
 * Answers `PRAGMA table_info(...)` per table, so a test can describe an
 * old `folders` table and a current `tracks` table at the same time. Both
 * migrations run on every open, and a single canned return value would let
 * one table's shape stand in for the other's.
 */
function pragmaReturns(
  tracks: { name: string }[],
  folders: { name: string }[],
) {
  mockGetAllSync.mockImplementation((sql: string) =>
    sql.includes('folders') ? folders : tracks,
  );
}

describe('getDatabase', () => {
  beforeEach(() => {
    // Reset the module singleton first, then zero the counters so the
    // reset's own closeSync call is not counted by the tests below.
    closeDatabase();
    jest.clearAllMocks();
    pragmaReturns(FRESH_COLUMNS, FRESH_FOLDER_COLUMNS);
    mockGetFirstSync.mockReturnValue({ value: '1' });
  });

  it('opens the database and creates the tracks table', () => {
    getDatabase();

    expect(mockOpenDatabaseSync).toHaveBeenCalledWith('refrain.db');
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS tracks'),
    );
  });

  it('creates the track_markers table', () => {
    getDatabase();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS track_markers'),
    );
  });

  it('does not ALTER when durationEstimated already exists (fresh DB)', () => {
    pragmaReturns(FRESH_COLUMNS, FRESH_FOLDER_COLUMNS);

    getDatabase();

    expect(mockGetAllSync).toHaveBeenCalledWith('PRAGMA table_info(tracks);');
    expect(mockExecSync).not.toHaveBeenCalledWith(ALTER_SQL);
  });

  it('ALTERs to add durationEstimated when missing (legacy DB)', () => {
    pragmaReturns(LEGACY_COLUMNS, FRESH_FOLDER_COLUMNS);

    getDatabase();

    expect(mockExecSync).toHaveBeenCalledWith(ALTER_SQL);
  });

  it('runs the URI migration to convert absolute paths to relative on open', () => {
    getDatabase();

    expect(mockExecSync).toHaveBeenCalledWith(URI_MIGRATION_SQL);
  });

  it('reuses the same database instance on subsequent calls', () => {
    const first = getDatabase();
    const second = getDatabase();

    expect(first).toBe(second);
    expect(mockOpenDatabaseSync).toHaveBeenCalledTimes(1);
  });

  it('ALTERs to add the folder pin and open-time columns when missing', () => {
    pragmaReturns(FRESH_COLUMNS, LEGACY_FOLDER_COLUMNS);

    getDatabase();

    expect(mockGetAllSync).toHaveBeenCalledWith('PRAGMA table_info(folders);');
    expect(mockExecSync).toHaveBeenCalledWith(ALTER_PIN_ORDER);
    expect(mockExecSync).toHaveBeenCalledWith(ALTER_LAST_OPENED);
  });

  it('leaves the folder columns alone when they already exist', () => {
    getDatabase();

    expect(mockExecSync).not.toHaveBeenCalledWith(ALTER_PIN_ORDER);
    expect(mockExecSync).not.toHaveBeenCalledWith(ALTER_LAST_OPENED);
  });

  it('flattens nested folders once and records that it has run', () => {
    mockGetFirstSync.mockReturnValue(undefined);

    getDatabase();

    expect(mockExecSync).toHaveBeenCalledWith(FLATTEN_SQL);
    expect(mockRunSync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      FLATTEN_KEY,
      '1',
    );
  });

  it('gives folders that predate the column an open time', () => {
    mockGetFirstSync.mockReturnValue(undefined);

    getDatabase();

    // Without this every folder a person already had would land in the
    // never-opened tail on native while the web upgrade puts the same
    // folders in the opened block — one library, two orderings.
    expect(mockExecSync).toHaveBeenCalledWith(BACKFILL_OPENED_SQL);
  });

  it('does not backfill again once the marker row is present', () => {
    getDatabase();

    expect(mockExecSync).not.toHaveBeenCalledWith(BACKFILL_OPENED_SQL);
  });

  it('does not cache the handle when a migration throws', () => {
    mockGetAllSync.mockImplementation(() => {
      throw new Error('disk I/O error');
    });

    expect(() => getDatabase()).toThrow('disk I/O error');
    expect(mockCloseSync).toHaveBeenCalledTimes(1);

    // A cached half-migrated handle would hide the failure from every
    // caller after the first, and would never retry.
    pragmaReturns(FRESH_COLUMNS, FRESH_FOLDER_COLUMNS);
    expect(() => getDatabase()).not.toThrow();
    expect(mockOpenDatabaseSync).toHaveBeenCalledTimes(2);
  });

  it('does not flatten again once the marker row is present', () => {
    getDatabase();

    expect(mockGetFirstSync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      FLATTEN_KEY,
    );
    expect(mockExecSync).not.toHaveBeenCalledWith(FLATTEN_SQL);
  });

  it('skips the flatten UPDATE when the table never had a parentId column', () => {
    mockGetFirstSync.mockReturnValue(undefined);
    pragmaReturns(
      FRESH_COLUMNS,
      FRESH_FOLDER_COLUMNS.filter((column) => column.name !== 'parentId'),
    );

    getDatabase();

    expect(mockExecSync).not.toHaveBeenCalledWith(FLATTEN_SQL);
    expect(mockRunSync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      FLATTEN_KEY,
      '1',
    );
  });

  it('creates the folders table with the pin and open-time columns', () => {
    getDatabase();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('pinOrder INTEGER DEFAULT NULL'),
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('lastOpenedAt INTEGER DEFAULT NULL'),
    );
  });

  it('creates the tracks table with the favourite and play-time columns', () => {
    getDatabase();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('isFavorite INTEGER NOT NULL DEFAULT 0'),
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('lastPlayedAt INTEGER DEFAULT NULL'),
    );
  });

  it('does not swallow unexpected migration errors', () => {
    mockGetAllSync.mockImplementation(() => {
      throw new Error('disk I/O error');
    });

    expect(() => getDatabase()).toThrow('disk I/O error');
  });
});

describe('closeDatabase', () => {
  beforeEach(() => {
    // Reset the module singleton first, then zero the counters so the
    // reset's own closeSync call is not counted by the tests below.
    closeDatabase();
    jest.clearAllMocks();
    pragmaReturns(FRESH_COLUMNS, FRESH_FOLDER_COLUMNS);
    mockGetFirstSync.mockReturnValue({ value: '1' });
  });

  it('closes an open database and allows reopening', () => {
    getDatabase();
    closeDatabase();

    expect(mockCloseSync).toHaveBeenCalledTimes(1);

    getDatabase();
    expect(mockOpenDatabaseSync).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when no database is open', () => {
    closeDatabase();
    expect(mockCloseSync).not.toHaveBeenCalled();
  });
});

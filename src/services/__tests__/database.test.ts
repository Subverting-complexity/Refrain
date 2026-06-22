import * as SQLite from 'expo-sqlite';
import { getDatabase, closeDatabase } from '../database';

const mockGetAllSync = jest.fn();
const mockExecSync = jest.fn();
const mockCloseSync = jest.fn();

jest.mock('expo-sqlite', () => ({
  // Defined inline so the factory does not depend on a not-yet-initialised
  // outer variable (jest hoists this above the const declarations above).
  openDatabaseSync: jest.fn(() => ({
    getAllSync: mockGetAllSync,
    execSync: mockExecSync,
    closeSync: mockCloseSync,
  })),
}));

const mockOpenDatabaseSync = SQLite.openDatabaseSync as jest.Mock;

const ALTER_SQL =
  'ALTER TABLE tracks ADD COLUMN durationEstimated INTEGER NOT NULL DEFAULT 1;';

const URI_MIGRATION_SQL = `UPDATE tracks SET uri = 'tracks/' || id || '.' || format WHERE uri LIKE 'file://%';`;

/** Columns present on a current-schema database (durationEstimated included). */
const FRESH_COLUMNS = [
  { name: 'id' },
  { name: 'filename' },
  { name: 'uri' },
  { name: 'format' },
  { name: 'durationMs' },
  { name: 'durationEstimated' },
  { name: 'fileSizeBytes' },
  { name: 'importedAt' },
];

/** Columns on a legacy database created before durationEstimated existed. */
const LEGACY_COLUMNS = FRESH_COLUMNS.filter(
  (column) => column.name !== 'durationEstimated',
);

describe('getDatabase', () => {
  beforeEach(() => {
    // Reset the module singleton first, then zero the counters so the
    // reset's own closeSync call is not counted by the tests below.
    closeDatabase();
    jest.clearAllMocks();
    mockGetAllSync.mockReturnValue(FRESH_COLUMNS);
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
    mockGetAllSync.mockReturnValue(FRESH_COLUMNS);

    getDatabase();

    expect(mockGetAllSync).toHaveBeenCalledWith('PRAGMA table_info(tracks);');
    expect(mockExecSync).not.toHaveBeenCalledWith(ALTER_SQL);
  });

  it('ALTERs to add durationEstimated when missing (legacy DB)', () => {
    mockGetAllSync.mockReturnValue(LEGACY_COLUMNS);

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
    mockGetAllSync.mockReturnValue(FRESH_COLUMNS);
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

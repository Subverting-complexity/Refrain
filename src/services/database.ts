import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Opens the database, creating and migrating the schema on first use.
 *
 * The handle is cached only once that schema work has finished. Caching it
 * first would mean a failed migration was raised to one caller and hidden
 * from every caller after it, each handed a database whose columns were
 * never added and which would never try again.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    const opened = SQLite.openDatabaseSync('refrain.db');
    try {
      opened.execSync(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        filename TEXT NOT NULL,
        uri TEXT NOT NULL,
        format TEXT NOT NULL,
        durationMs INTEGER NOT NULL,
        durationEstimated INTEGER NOT NULL DEFAULT 1,
        fileSizeBytes INTEGER NOT NULL,
        importedAt INTEGER NOT NULL,
        isFavorite INTEGER NOT NULL DEFAULT 0,
        lastPlayedAt INTEGER DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS track_markers (
        trackId TEXT PRIMARY KEY NOT NULL,
        markerA INTEGER,
        markerB INTEGER,
        loopEnabled INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS marker_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        trackId TEXT NOT NULL,
        name TEXT NOT NULL,
        markerA INTEGER,
        markerB INTEGER,
        loopEnabled INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_marker_profiles_trackId
        ON marker_profiles (trackId);
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        parentId TEXT,
        createdAt INTEGER NOT NULL,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        pinOrder INTEGER DEFAULT NULL,
        lastOpenedAt INTEGER DEFAULT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_folders_parentId
        ON folders (parentId);
    `);
      migrateTracksSchema(opened);
      migrateFoldersSchema(opened);
    } catch (error) {
      // Close the handle, but never let the close replace the error that
      // made it necessary. A corrupt database is exactly the case that both
      // fails the migration and fails to close cleanly, and the migration
      // error is the one that says what is wrong.
      try {
        opened.closeSync();
      } catch {
        // Deliberately ignored — see above.
      }
      throw error;
    }
    db = opened;
  }
  return db;
}

/**
 * Bring a legacy `tracks` table up to the current schema.
 *
 * `durationEstimated` is part of the `CREATE TABLE` above, so a freshly
 * created database already has the column. Databases created before the
 * column existed do not. Rather than issue the `ALTER` unconditionally and
 * swallow the guaranteed "duplicate column" error on every fresh DB, inspect
 * the existing columns and only add what is missing.
 *
 * URIs are stored as relative paths (`tracks/<id>.<format>`) so they survive
 * iOS sandbox UUID rotation on TestFlight updates. Any absolute `file://` URIs
 * left over from an older build are converted here on first open after upgrade.
 */
function migrateTracksSchema(database: SQLite.SQLiteDatabase): void {
  const columns = database.getAllSync<{ name: string }>(
    `PRAGMA table_info(tracks);`,
  );
  const hasDurationEstimated = columns.some(
    (column) => column.name === 'durationEstimated',
  );
  if (!hasDurationEstimated) {
    database.execSync(
      `ALTER TABLE tracks ADD COLUMN durationEstimated INTEGER NOT NULL DEFAULT 1;`,
    );
  }
  const hasFolderId = columns.some((column) => column.name === 'folderId');
  if (!hasFolderId) {
    database.execSync(
      `ALTER TABLE tracks ADD COLUMN folderId TEXT DEFAULT NULL;`,
    );
  }
  const hasSortOrder = columns.some((column) => column.name === 'sortOrder');
  if (!hasSortOrder) {
    database.execSync(
      `ALTER TABLE tracks ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0;`,
    );
  }
  const hasIsFavorite = columns.some((column) => column.name === 'isFavorite');
  if (!hasIsFavorite) {
    database.execSync(
      `ALTER TABLE tracks ADD COLUMN isFavorite INTEGER NOT NULL DEFAULT 0;`,
    );
  }
  const hasLastPlayedAt = columns.some(
    (column) => column.name === 'lastPlayedAt',
  );
  if (!hasLastPlayedAt) {
    database.execSync(
      `ALTER TABLE tracks ADD COLUMN lastPlayedAt INTEGER DEFAULT NULL;`,
    );
  }
  database.execSync(
    `UPDATE tracks SET uri = 'tracks/' || id || '.' || format WHERE uri LIKE 'file://%';`,
  );
}

/**
 * Settings key recording that the one-off flatten migration has run.
 *
 * The flatten below rewrites every folder's `parentId` to NULL, which is
 * idempotent in effect but not free, and re-running it on every app open
 * would also silently undo any future reintroduction of nesting. A marker row
 * in `settings` makes it run exactly once per database.
 */
const FLATTEN_MIGRATION_KEY = 'migration.foldersFlattened';

/**
 * Bring a legacy `folders` table up to the current schema, then flatten it.
 *
 * Two jobs, in order:
 *
 * 1. Add `pinOrder` and `lastOpenedAt` where they are missing, using the
 *    same inspect-then-ALTER pattern as `migrateTracksSchema` — a database
 *    created by the `CREATE TABLE` above already has them, an older one does
 *    not, and issuing the ALTER unconditionally would fail on every fresh
 *    database.
 * 2. Promote every nested folder to the top level. Folders are single-level
 *    from this release on, so a folder that was inside another keeps its own
 *    name and becomes independent: `Gigs > March` turns into two top-level
 *    folders, `Gigs` and `March`. Nothing is merged, renamed or deleted, and
 *    no track changes folder.
 *
 * The flatten is not wrapped in a transaction and does not need to be: both
 * statements are idempotent, so an interruption before the marker row is
 * written costs nothing more than running them again on the next open.
 *
 * `parentId` and `sortOrder` stay as columns even though nothing reads them
 * any more. Dropping a column in SQLite means rebuilding the table, and
 * leaving them keeps a freshly created database and an upgraded one
 * physically identical, which is worth more than the two dead columns cost.
 */
function migrateFoldersSchema(database: SQLite.SQLiteDatabase): void {
  const columns = database.getAllSync<{ name: string }>(
    `PRAGMA table_info(folders);`,
  );
  const hasPinOrder = columns.some((column) => column.name === 'pinOrder');
  if (!hasPinOrder) {
    database.execSync(
      `ALTER TABLE folders ADD COLUMN pinOrder INTEGER DEFAULT NULL;`,
    );
  }
  const hasLastOpenedAt = columns.some(
    (column) => column.name === 'lastOpenedAt',
  );
  if (!hasLastOpenedAt) {
    database.execSync(
      `ALTER TABLE folders ADD COLUMN lastOpenedAt INTEGER DEFAULT NULL;`,
    );
  }

  const flattened = database.getFirstSync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    FLATTEN_MIGRATION_KEY,
  );
  if (flattened) return;

  if (columns.some((column) => column.name === 'parentId')) {
    database.execSync('UPDATE folders SET parentId = NULL;');
  }
  // Give folders that predate this column an open time, so the upgrade
  // does not drop every folder a person already had into the
  // never-opened tail. `insertFolder` stamps new folders the same way,
  // and the web upgrade does exactly this — without it the same library
  // would read back in two different orders on the two platforms.
  database.execSync(
    'UPDATE folders SET lastOpenedAt = createdAt WHERE lastOpenedAt IS NULL;',
  );
  database.runSync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    FLATTEN_MIGRATION_KEY,
    '1',
  );
}

export function closeDatabase(): void {
  if (!db) return;
  const opened = db;
  // Drop the handle before closing, not after. A close that throws would
  // otherwise leave the stale handle cached for the rest of the process, and
  // every later `getDatabase` call would hand back a database that is already
  // gone. This is the mirror of the open path above, which likewise refuses
  // to cache a handle it could not make good. The error still reaches the
  // caller — they asked for a close and did not get one.
  db = null;
  opened.closeSync();
}

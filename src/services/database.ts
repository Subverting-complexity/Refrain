import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('refrain.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        filename TEXT NOT NULL,
        uri TEXT NOT NULL,
        format TEXT NOT NULL,
        durationMs INTEGER NOT NULL,
        durationEstimated INTEGER NOT NULL DEFAULT 1,
        fileSizeBytes INTEGER NOT NULL,
        importedAt INTEGER NOT NULL
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
    `);
    migrateTracksSchema(db);
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
  database.execSync(
    `UPDATE tracks SET uri = 'tracks/' || id || '.' || format WHERE uri LIKE 'file://%';`,
  );
}

export function closeDatabase(): void {
  if (db) {
    db.closeSync();
    db = null;
  }
}

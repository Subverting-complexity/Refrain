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
    `);
    try {
      db.execSync(
        `ALTER TABLE tracks ADD COLUMN durationEstimated INTEGER NOT NULL DEFAULT 1;`,
      );
    } catch (e: unknown) {
      // Swallow only "duplicate column" errors; anything else is unexpected
      if (!(e instanceof Error) || !e.message.includes('duplicate column')) {
        throw e;
      }
    }
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.closeSync();
    db = null;
  }
}

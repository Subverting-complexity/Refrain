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
        fileSizeBytes INTEGER NOT NULL,
        importedAt INTEGER NOT NULL
      );
    `);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.closeSync();
    db = null;
  }
}

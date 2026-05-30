import { File, Paths } from 'expo-file-system';

import { Track } from '../types';
import { getDatabase } from './database';

let migrated = false;

async function migrateFromJson(): Promise<void> {
  if (migrated) return;
  migrated = true;

  const jsonFile = new File(Paths.document, 'tracks.json');
  if (!jsonFile.exists) return;

  try {
    const tracks: Track[] = JSON.parse(await jsonFile.text());
    const db = getDatabase();
    for (const track of tracks) {
      db.runSync(
        `INSERT OR IGNORE INTO tracks (id, filename, uri, format, durationMs, fileSizeBytes, importedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        track.id,
        track.filename,
        track.uri,
        track.format,
        track.durationMs,
        track.fileSizeBytes,
        track.importedAt,
      );
    }
    jsonFile.delete();
  } catch {
    // Corrupt JSON — skip migration, old file cleaned up on next launch
  }
}

export async function loadTracks(): Promise<Track[]> {
  await migrateFromJson();
  const db = getDatabase();
  return db.getAllSync<Track>(
    'SELECT id, filename, uri, format, durationMs, fileSizeBytes, importedAt FROM tracks ORDER BY importedAt DESC',
  );
}

export function insertTrack(track: Track): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO tracks (id, filename, uri, format, durationMs, fileSizeBytes, importedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    track.id,
    track.filename,
    track.uri,
    track.format,
    track.durationMs,
    track.fileSizeBytes,
    track.importedAt,
  );
}

export function deleteTrack(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM tracks WHERE id = ?', id);
}

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
        `INSERT OR IGNORE INTO tracks (id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        track.id,
        track.filename,
        track.uri,
        track.format,
        track.durationMs,
        track.durationEstimated ? 1 : 0,
        track.fileSizeBytes,
        track.importedAt,
      );
    }
    jsonFile.delete();
  } catch {
    // Corrupt JSON — skip migration, old file cleaned up on next launch
  }
}

interface TrackRow {
  id: string;
  filename: string;
  uri: string;
  format: string;
  durationMs: number;
  durationEstimated: number;
  fileSizeBytes: number;
  importedAt: number;
}

function rowToTrack(row: TrackRow): Track {
  return {
    ...row,
    format: row.format as Track['format'],
    durationEstimated: row.durationEstimated === 1,
  };
}

export async function loadTracks(): Promise<Track[]> {
  await migrateFromJson();
  const db = getDatabase();
  const rows = db.getAllSync<TrackRow>(
    'SELECT id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt FROM tracks ORDER BY importedAt DESC',
  );
  return rows.map(rowToTrack);
}

export function insertTrack(track: Track): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO tracks (id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    track.id,
    track.filename,
    track.uri,
    track.format,
    track.durationMs,
    track.durationEstimated ? 1 : 0,
    track.fileSizeBytes,
    track.importedAt,
  );
}

export function updateTrackDuration(id: string, durationMs: number): void {
  const db = getDatabase();
  db.runSync(
    'UPDATE tracks SET durationMs = ?, durationEstimated = 0 WHERE id = ?',
    durationMs,
    id,
  );
}

export function deleteTrack(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM tracks WHERE id = ?', id);
}

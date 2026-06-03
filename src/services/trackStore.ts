import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import { Track } from '../types';
import { getDatabase } from './database';

/**
 * The `expo-file-system` `File`/`Directory` API is native-only — its web stub
 * lacks the methods the constructor calls, so `new File(...)` throws on web.
 * Skip filesystem-backed work (legacy JSON migration, orphan sweep) there.
 */
const FILE_SYSTEM_SUPPORTED = Platform.OS !== 'web';

let migrated = false;

async function migrateFromJson(): Promise<void> {
  if (migrated) return;
  migrated = true;
  if (!FILE_SYSTEM_SUPPORTED) return;

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
        track.durationEstimated === false ? 0 : 1,
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
  cleanupOrphanFiles();
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
  const row = db.getFirstSync<{ uri: string }>(
    'SELECT uri FROM tracks WHERE id = ?',
    id,
  );
  db.runSync('DELETE FROM tracks WHERE id = ?', id);
  if (row?.uri) {
    deleteFileIfExists(row.uri);
  }
}

/**
 * Deletes a file at the given URI if it exists. Never throws — a missing
 * file or a delete failure is treated as a no-op so callers (e.g. track
 * removal) are not interrupted by filesystem state.
 */
function deleteFileIfExists(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // File already gone or cannot be deleted — non-fatal.
  }
}

/**
 * Defensive crash-recovery sweep: deletes any file in the tracks directory
 * whose id is not present in the database. Best-effort — never throws.
 * Returns the number of orphan files removed.
 */
export function cleanupOrphanFiles(): number {
  if (!FILE_SYSTEM_SUPPORTED) return 0;

  const db = getDatabase();
  let removed = 0;
  try {
    const tracksDir = new Directory(Paths.document, 'tracks');
    if (!tracksDir.exists) return 0;

    const rows = db.getAllSync<{ id: string }>('SELECT id FROM tracks');
    const knownIds = new Set(rows.map((r) => r.id));

    for (const entry of tracksDir.list()) {
      if (!(entry instanceof File)) continue;
      const id = entry.name.replace(/\.[^.]+$/, '');
      if (!knownIds.has(id)) {
        deleteFileIfExists(entry.uri);
        removed += 1;
      }
    }
  } catch {
    // Directory unreadable or listing failed — non-fatal.
  }
  return removed;
}

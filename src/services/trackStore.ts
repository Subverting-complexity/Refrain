import { Directory, File, Paths } from 'expo-file-system';

import { Track } from '../types';
import { getDatabase } from './database';
import { deleteMarkers, deleteProfilesForTrack } from './markerStore';

/**
 * Converts a relative track path (`tracks/<id>.<format>`) to an absolute URI
 * using the current sandbox root. Absolute URIs (legacy or blob:) pass through
 * unchanged so the function is safe to call unconditionally.
 *
 * Relative storage is required on iOS because the sandbox UUID in
 * `Paths.document` changes on every TestFlight update, invalidating any
 * absolute path that was captured at import time.
 */
function resolveUri(relOrAbsUri: string): string {
  if (relOrAbsUri.startsWith('file://') || relOrAbsUri.startsWith('blob:')) {
    return relOrAbsUri;
  }
  return `${Paths.document.uri}/${relOrAbsUri}`;
}

let migrated = false;

async function migrateFromJson(): Promise<void> {
  if (migrated) return;

  const jsonFile = new File(Paths.document, 'tracks.json');
  if (!jsonFile.exists) {
    migrated = true;
    return;
  }

  try {
    const tracks: Track[] = JSON.parse(await jsonFile.text());
    const db = getDatabase();
    for (const track of tracks) {
      db.runSync(
        `INSERT OR IGNORE INTO tracks (id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        track.id,
        track.filename,
        `tracks/${track.id}.${track.format}`,
        track.format,
        track.durationMs,
        track.durationEstimated === false ? 0 : 1,
        track.fileSizeBytes,
        track.importedAt,
      );
    }
    migrated = true;
    jsonFile.delete();
  } catch {
    // Corrupt JSON or partial DB failure — leave migrated false so the
    // next loadTracks() call retries within this session.
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
    uri: resolveUri(row.uri),
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

/**
 * Reads a single track by id, or `null` when it is not in the library. The
 * returned `uri` is resolved against the current sandbox root, so it is a
 * playable absolute path even for rows written before an iOS sandbox rotation.
 * Callers use this to re-resolve a playable uri from a track id rather than
 * trusting one captured earlier (see `useTrackSource`).
 */
export async function getTrack(id: string): Promise<Track | null> {
  await migrateFromJson();
  const db = getDatabase();
  const row = db.getFirstSync<TrackRow>(
    'SELECT id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt FROM tracks WHERE id = ?',
    id,
  );
  return row ? rowToTrack(row) : null;
}

export function insertTrack(track: Track): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO tracks (id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    track.id,
    track.filename,
    `tracks/${track.id}.${track.format}`,
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
  deleteMarkers(id);
  deleteProfilesForTrack(id);
  if (row?.uri) {
    deleteFileIfExists(resolveUri(row.uri));
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

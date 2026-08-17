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
        `INSERT OR IGNORE INTO tracks (id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt, folderId, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        track.id,
        track.filename,
        `tracks/${track.id}.${track.format}`,
        track.format,
        track.durationMs,
        track.durationEstimated === false ? 0 : 1,
        track.fileSizeBytes,
        track.importedAt,
        null,
        0,
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
  folderId: string | null;
  sortOrder: number;
}

function rowToTrack(row: TrackRow): Track {
  return {
    ...row,
    format: row.format as Track['format'],
    durationEstimated: row.durationEstimated === 1,
    uri: resolveUri(row.uri),
    folderId: row.folderId ?? null,
    sortOrder: row.sortOrder ?? 0,
  };
}

export async function loadTracks(folderId?: string | null): Promise<Track[]> {
  await migrateFromJson();
  cleanupOrphanFiles();
  const db = getDatabase();
  const rows =
    folderId === undefined
      ? db.getAllSync<TrackRow>('SELECT * FROM tracks ORDER BY importedAt DESC')
      : folderId === null
        ? db.getAllSync<TrackRow>(
            'SELECT * FROM tracks WHERE folderId IS NULL ORDER BY sortOrder ASC, importedAt DESC',
          )
        : db.getAllSync<TrackRow>(
            'SELECT * FROM tracks WHERE folderId = ? ORDER BY sortOrder ASC, importedAt DESC',
            folderId,
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
    `INSERT INTO tracks (id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt, folderId, sortOrder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    track.id,
    track.filename,
    `tracks/${track.id}.${track.format}`,
    track.format,
    track.durationMs,
    track.durationEstimated ? 1 : 0,
    track.fileSizeBytes,
    track.importedAt,
    track.folderId,
    track.sortOrder,
  );
}

/**
 * Renames a track's display filename, leaving every other fact about it
 * untouched.
 *
 * Only the `filename` column is written. The stored `uri` is derived from the
 * id and format (`tracks/<id>.<format>`) rather than from the display name, so
 * the audio file on disk keeps its path; format, duration (and whether it is
 * estimated), byte size and import time are not part of the statement; and the
 * marker and segment-profile rows are keyed by track id, so they follow the
 * track rather than its name. A rename is therefore metadata-preserving by
 * construction, not by convention.
 */
export function renameTrack(id: string, filename: string): void {
  const db = getDatabase();
  db.runSync('UPDATE tracks SET filename = ? WHERE id = ?', filename, id);
}

export function updateTrackDuration(id: string, durationMs: number): void {
  const db = getDatabase();
  db.runSync(
    'UPDATE tracks SET durationMs = ?, durationEstimated = 0 WHERE id = ?',
    durationMs,
    id,
  );
}

export function moveTrackToFolder(id: string, folderId: string | null): void {
  const db = getDatabase();
  db.runSync('UPDATE tracks SET folderId = ? WHERE id = ?', folderId, id);
}

export function updateTrackSortOrder(id: string, sortOrder: number): void {
  const db = getDatabase();
  db.runSync('UPDATE tracks SET sortOrder = ? WHERE id = ?', sortOrder, id);
}

/**
 * Returns the number of tracks in each folder, keyed by folder id.
 * Only folders that actually contain tracks appear in the result;
 * root-level tracks (folderId IS NULL) are excluded from the map
 * because the UI never needs a "root count" badge.
 */
export function getTrackCountsByFolder(): Record<string, number> {
  const db = getDatabase();
  const rows = db.getAllSync<{ folderId: string | null; cnt: number }>(
    'SELECT folderId, COUNT(*) as cnt FROM tracks WHERE folderId IS NOT NULL GROUP BY folderId',
  );
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.folderId != null) {
      counts[row.folderId] = row.cnt;
    }
  }
  return counts;
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

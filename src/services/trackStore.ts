import { Directory, File, Paths } from 'expo-file-system';

import { LoadTracksOptions, Track, TrackCounts } from '../types';
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
        `INSERT OR IGNORE INTO tracks (id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt, folderId, isFavorite, lastPlayedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        null,
      );
    }
    migrated = true;
    jsonFile.delete();
  } catch {
    // Corrupt JSON or partial DB failure — leave migrated false so the
    // next loadTracks() call retries within this session.
  }
}

/**
 * The columns every read names explicitly. `SELECT *` would also return
 * the retired `sortOrder` column, which still exists in the table, and the
 * spread in `rowToTrack` would then put a field on the returned track that
 * the `Track` type no longer has.
 */
const TRACK_COLUMNS =
  'id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt, folderId, isFavorite, lastPlayedAt';

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
  isFavorite: number;
  lastPlayedAt: number | null;
}

function rowToTrack(row: TrackRow): Track {
  return {
    ...row,
    format: row.format as Track['format'],
    durationEstimated: row.durationEstimated === 1,
    uri: resolveUri(row.uri),
    folderId: row.folderId ?? null,
    isFavorite: row.isFavorite === 1,
    lastPlayedAt: row.lastPlayedAt ?? null,
  };
}

/**
 * Reads one slice of the library, newest import first.
 *
 * Manual track ordering is gone, so `importedAt DESC` is the only order the
 * store applies; any other order the reader wants is applied in the UI on top
 * of this. The default scope is every track.
 */
export async function loadTracks(
  options: LoadTracksOptions = { scope: 'all' },
): Promise<Track[]> {
  await migrateFromJson();
  cleanupOrphanFiles();
  const db = getDatabase();
  const rows =
    options.scope === 'all'
      ? db.getAllSync<TrackRow>(
          `SELECT ${TRACK_COLUMNS} FROM tracks ORDER BY importedAt DESC`,
        )
      : options.scope === 'favorites'
        ? db.getAllSync<TrackRow>(
            `SELECT ${TRACK_COLUMNS} FROM tracks WHERE isFavorite = 1 ORDER BY importedAt DESC`,
          )
        : options.scope === 'unfiled'
          ? db.getAllSync<TrackRow>(
              `SELECT ${TRACK_COLUMNS} FROM tracks WHERE folderId IS NULL ORDER BY importedAt DESC`,
            )
          : db.getAllSync<TrackRow>(
              `SELECT ${TRACK_COLUMNS} FROM tracks WHERE folderId = ? ORDER BY importedAt DESC`,
              options.folderId,
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
    `SELECT ${TRACK_COLUMNS} FROM tracks WHERE id = ?`,
    id,
  );
  return row ? rowToTrack(row) : null;
}

export function insertTrack(track: Track): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO tracks (id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt, folderId, isFavorite, lastPlayedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    track.id,
    track.filename,
    `tracks/${track.id}.${track.format}`,
    track.format,
    track.durationMs,
    track.durationEstimated ? 1 : 0,
    track.fileSizeBytes,
    track.importedAt,
    track.folderId,
    track.isFavorite ? 1 : 0,
    track.lastPlayedAt,
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

/** Stars or unstars a track. An unknown id is a no-op. */
export function setTrackFavorite(id: string, isFavorite: boolean): void {
  const db = getDatabase();
  db.runSync(
    'UPDATE tracks SET isFavorite = ? WHERE id = ?',
    isFavorite ? 1 : 0,
    id,
  );
}

/**
 * Records that a track was played at `at` (epoch milliseconds). The caller
 * supplies the timestamp rather than the store reading a clock, so the write
 * is deterministic in tests and the same moment can be recorded through
 * either platform implementation.
 */
export function markTrackPlayed(id: string, at: number): void {
  const db = getDatabase();
  db.runSync('UPDATE tracks SET lastPlayedAt = ? WHERE id = ?', at, id);
}

/**
 * Every track tally the library root needs, in one pass.
 *
 * `byFolder` is keyed by folder id and lists only folders that actually hold
 * tracks. Alongside it come the three root rows that are not folders: every
 * track, starred tracks, and tracks that sit in no folder. Unfiled is a view
 * over `folderId IS NULL` rather than a folder row, so it is counted here
 * instead of appearing in `byFolder`.
 */
export function getTrackCountsByFolder(): TrackCounts {
  const db = getDatabase();
  const rows = db.getAllSync<{ folderId: string | null; cnt: number }>(
    'SELECT folderId, COUNT(*) as cnt FROM tracks GROUP BY folderId',
  );
  const byFolder: Record<string, number> = {};
  let all = 0;
  let unfiled = 0;
  for (const row of rows) {
    all += row.cnt;
    if (row.folderId == null) {
      unfiled += row.cnt;
    } else {
      byFolder[row.folderId] = row.cnt;
    }
  }
  const favoriteRow = db.getFirstSync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM tracks WHERE isFavorite = 1',
  );
  return { byFolder, all, favorites: favoriteRow?.cnt ?? 0, unfiled };
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

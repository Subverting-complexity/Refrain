import { Track } from '../types';
import { getDatabase } from './database';
import {
  deleteBlob,
  getObjectUrl,
  listBlobIds,
  revokeObjectUrl,
} from './webBlobStore.web';

/**
 * Web implementation of the track metadata store. Metadata rows go through
 * the same SQLite database as native (expo-sqlite has a wasm web backend),
 * but binary audio lives in IndexedDB (see `webBlobStore.web`) instead of
 * the native filesystem.
 *
 * The DB `uri` column stores a stable `idb://<id>` sentinel; the in-memory
 * `Track.uri` handed to the UI is a `blob:` object URL resolved at load
 * time so the player can play it. There is no legacy `tracks.json`
 * migration on web.
 */

function uriForId(id: string): string {
  return `idb://${id}`;
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

async function rowToTrack(row: TrackRow): Promise<Track> {
  // Resolve the playable object URL; fall back to the sentinel if the blob
  // is missing (orphaned row) so the shape stays valid.
  const uri = (await getObjectUrl(row.id)) ?? uriForId(row.id);
  return {
    id: row.id,
    filename: row.filename,
    uri,
    format: row.format as Track['format'],
    durationMs: row.durationMs,
    durationEstimated: row.durationEstimated === 1,
    fileSizeBytes: row.fileSizeBytes,
    importedAt: row.importedAt,
  };
}

export async function loadTracks(): Promise<Track[]> {
  void cleanupOrphanFiles();
  const db = getDatabase();
  const rows = db.getAllSync<TrackRow>(
    'SELECT id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt FROM tracks ORDER BY importedAt DESC',
  );
  return Promise.all(rows.map(rowToTrack));
}

export function insertTrack(track: Track): void {
  const db = getDatabase();
  // Persist the canonical sentinel, never the volatile object URL.
  db.runSync(
    `INSERT INTO tracks (id, filename, uri, format, durationMs, durationEstimated, fileSizeBytes, importedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    track.id,
    track.filename,
    uriForId(track.id),
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
  // Revoke the cached object URL and drop the blob. Fire-and-forget: a
  // failed blob delete must not interrupt removal from the library.
  revokeObjectUrl(id);
  void deleteBlob(id).catch(() => undefined);
}

/**
 * Crash-recovery sweep: deletes IndexedDB blobs whose id is not present in
 * the database. Best-effort and asynchronous — never throws. Resolves to
 * the number of orphan blobs removed.
 */
export async function cleanupOrphanFiles(): Promise<number> {
  try {
    const db = getDatabase();
    const rows = db.getAllSync<{ id: string }>('SELECT id FROM tracks');
    const knownIds = new Set(rows.map((r) => r.id));

    const storedIds = await listBlobIds();
    let removed = 0;
    for (const id of storedIds) {
      if (!knownIds.has(id)) {
        await deleteBlob(id);
        removed += 1;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

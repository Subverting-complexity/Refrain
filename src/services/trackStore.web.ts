import { Track } from '../types';
import {
  deleteStoredTrack,
  getAllStoredTracks,
  getStoredTrack,
  getStoredTrackIds,
  putStoredTrack,
  StoredTrack,
} from './database.web';
import { deleteMarkers, deleteProfilesForTrack } from './markerStore.web';
import {
  deleteBlob,
  getObjectUrl,
  listBlobIds,
  revokeObjectUrl,
} from './webBlobStore.web';

/**
 * Web implementation of the track metadata store. Metadata records live in
 * IndexedDB (see `database.web`) and binary audio lives in IndexedDB too (see
 * `webBlobStore.web`), instead of expo-sqlite + the native filesystem. The
 * playable `Track.uri` handed to the UI is a `blob:` object URL resolved from
 * the stored audio at load time so the player can play it.
 */

async function rowToTrack(row: StoredTrack): Promise<Track> {
  // Resolve the playable object URL; fall back to a sentinel if the blob is
  // missing (orphaned record) so the shape stays valid.
  const uri = (await getObjectUrl(row.id)) ?? `idb://${row.id}`;
  return {
    id: row.id,
    filename: row.filename,
    uri,
    format: row.format as Track['format'],
    durationMs: row.durationMs,
    durationEstimated: row.durationEstimated,
    fileSizeBytes: row.fileSizeBytes,
    importedAt: row.importedAt,
  };
}

function toStored(track: Track): StoredTrack {
  return {
    id: track.id,
    filename: track.filename,
    format: track.format,
    durationMs: track.durationMs,
    durationEstimated: track.durationEstimated,
    fileSizeBytes: track.fileSizeBytes,
    importedAt: track.importedAt,
  };
}

export async function loadTracks(): Promise<Track[]> {
  void cleanupOrphanFiles().catch((e: unknown) => {
    console.warn('orphan cleanup failed', e);
  });
  const rows = await getAllStoredTracks();
  // Newest first — IndexedDB getAll returns keys in ascending order.
  rows.sort((a, b) => b.importedAt - a.importedAt);
  return Promise.all(rows.map(rowToTrack));
}

/**
 * Reads a single track by id, or `null` when it is not in the library. The
 * `uri` is a freshly resolved `blob:` object URL, which is why the player must
 * re-read it per page session rather than reusing one captured earlier: object
 * URLs die with the document that created them (see `useTrackSource`).
 */
export async function getTrack(id: string): Promise<Track | null> {
  const row = await getStoredTrack(id);
  return row ? rowToTrack(row) : null;
}

export async function insertTrack(track: Track): Promise<void> {
  await putStoredTrack(toStored(track));
}

/**
 * Renames a track's display filename, leaving every other fact about it
 * untouched.
 *
 * The existing record is read back and spread into the write, so format,
 * duration, byte size and import time are re-persisted byte-identical rather
 * than rebuilt. The audio blob is keyed by track id in `webBlobStore.web` and
 * is not touched at all, as are the marker and segment-profile records. An
 * unknown id is a no-op rather than an insert — a rename must never conjure a
 * metadata record with no audio behind it.
 */
export async function renameTrack(id: string, filename: string): Promise<void> {
  const row = await getStoredTrack(id);
  if (!row) return;
  await putStoredTrack({ ...row, filename });
}

export async function updateTrackDuration(
  id: string,
  durationMs: number,
): Promise<void> {
  const row = await getStoredTrack(id);
  if (!row) return;
  await putStoredTrack({ ...row, durationMs, durationEstimated: false });
}

export async function deleteTrack(id: string): Promise<void> {
  await deleteStoredTrack(id);
  await deleteMarkers(id);
  await deleteProfilesForTrack(id);
  // Revoke the cached object URL and drop the blob. Fire-and-forget: a
  // failed blob delete must not interrupt removal from the library.
  revokeObjectUrl(id);
  void deleteBlob(id).catch(() => undefined);
}

/**
 * Crash-recovery sweep: deletes IndexedDB blobs whose id is not present in
 * the metadata store. Best-effort and asynchronous — never throws. Resolves
 * to the number of orphan blobs removed.
 */
export async function cleanupOrphanFiles(): Promise<number> {
  try {
    const knownIds = new Set(await getStoredTrackIds());
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

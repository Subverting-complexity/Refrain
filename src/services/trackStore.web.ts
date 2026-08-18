import { LoadTracksOptions, Track, TrackCounts } from '../types';
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
    folderId: row.folderId ?? null,
    isFavorite: row.isFavorite ?? false,
    lastPlayedAt: row.lastPlayedAt ?? null,
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
    folderId: track.folderId,
    isFavorite: track.isFavorite,
    lastPlayedAt: track.lastPlayedAt,
  };
}

/**
 * Reads one slice of the library, newest import first.
 *
 * IndexedDB has no query language, so the filtering the native store hands
 * to SQL happens here in memory. Manual ordering is gone, so import time is
 * the only order the store applies. The default scope is every track.
 */
export async function loadTracks(
  options: LoadTracksOptions = { scope: 'all' },
): Promise<Track[]> {
  void cleanupOrphanFiles().catch((e: unknown) => {
    console.warn('orphan cleanup failed', e);
  });
  let rows = await getAllStoredTracks();
  if (options.scope === 'favorites') {
    rows = rows.filter((r) => r.isFavorite === true);
  } else if (options.scope === 'unfiled') {
    rows = rows.filter((r) => (r.folderId ?? null) === null);
  } else if (options.scope === 'folder') {
    rows = rows.filter((r) => r.folderId === options.folderId);
  }
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

export async function moveTrackToFolder(
  id: string,
  folderId: string | null,
): Promise<void> {
  const row = await getStoredTrack(id);
  if (!row) return;
  await putStoredTrack({ ...row, folderId });
}

/** Stars or unstars a track. An unknown id is a no-op. */
export async function setTrackFavorite(
  id: string,
  isFavorite: boolean,
): Promise<void> {
  const row = await getStoredTrack(id);
  if (!row) return;
  await putStoredTrack({ ...row, isFavorite });
}

/**
 * Records that a track was played at `at` (epoch milliseconds). The caller
 * supplies the timestamp rather than the store reading a clock, so the write
 * is deterministic in tests and the same moment can be recorded through
 * either platform implementation.
 */
export async function markTrackPlayed(id: string, at: number): Promise<void> {
  const row = await getStoredTrack(id);
  if (!row) return;
  await putStoredTrack({ ...row, lastPlayedAt: at });
}

/**
 * Every track tally the library root needs, in one pass.
 *
 * `byFolder` is keyed by folder id and lists only folders that actually hold
 * tracks. Alongside it come the three root rows that are not folders: every
 * track, starred tracks, and tracks that sit in no folder. Unfiled is a view
 * over a null `folderId` rather than a folder record, so it is counted here
 * instead of appearing in `byFolder`.
 */
export async function getTrackCountsByFolder(): Promise<TrackCounts> {
  const rows = await getAllStoredTracks();
  const byFolder: Record<string, number> = {};
  let favorites = 0;
  let unfiled = 0;
  for (const row of rows) {
    if (row.isFavorite) favorites += 1;
    if (row.folderId == null) {
      unfiled += 1;
    } else {
      byFolder[row.folderId] = (byFolder[row.folderId] ?? 0) + 1;
    }
  }
  return { byFolder, all: rows.length, favorites, unfiled };
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

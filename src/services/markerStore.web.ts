import { ActiveMarkers } from '../types';
import {
  deleteStoredMarkers,
  getStoredMarkers,
  putStoredMarkers,
} from './database.web';

/**
 * Web implementation of the per-track marker store. Records live in the
 * `track_markers` IndexedDB object store (see `database.web`), mirroring the
 * native SQLite-backed `markerStore` with an async API. Holds the *active*
 * marker set (`markerA`, `markerB`, `loopEnabled`) keyed by track `id`.
 */

/** Returns the saved markers for a track, or `null` when nothing is saved. */
export async function getActiveMarkers(
  trackId: string,
): Promise<ActiveMarkers | null> {
  const row = await getStoredMarkers(trackId);
  if (!row) return null;
  return {
    markerA: row.markerA,
    markerB: row.markerB,
    loopEnabled: row.loopEnabled,
  };
}

/** Upserts the active marker set for a track. */
export async function setActiveMarkers(
  trackId: string,
  markers: ActiveMarkers,
): Promise<void> {
  await putStoredMarkers({ trackId, ...markers });
}

/** Removes a track's marker row. Used when a track is deleted. */
export async function deleteMarkers(trackId: string): Promise<void> {
  await deleteStoredMarkers(trackId);
}

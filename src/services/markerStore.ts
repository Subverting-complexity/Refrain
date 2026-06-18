import { ActiveMarkers } from '../types';
import { getDatabase } from './database';

/**
 * Per-track A/B marker persistence, backed by the SQLite `track_markers`
 * table. Keyed by track `id`, it holds the *active* marker set
 * (`markerA`, `markerB`, `loopEnabled`) so markers survive track reloads and
 * app restarts instead of living only in transient `audioEngine` state.
 *
 * Native is synchronous (expo-sqlite); the web counterpart in
 * `markerStore.web` mirrors this API asynchronously over IndexedDB. Named
 * segment profiles are layered on top of this same module later.
 */

interface MarkerRow {
  markerA: number | null;
  markerB: number | null;
  loopEnabled: number;
}

/** Returns the saved markers for a track, or `null` when nothing is saved. */
export function getActiveMarkers(trackId: string): ActiveMarkers | null {
  const db = getDatabase();
  const row = db.getFirstSync<MarkerRow>(
    'SELECT markerA, markerB, loopEnabled FROM track_markers WHERE trackId = ?',
    trackId,
  );
  if (!row) return null;
  return {
    markerA: row.markerA,
    markerB: row.markerB,
    loopEnabled: row.loopEnabled === 1,
  };
}

/** Upserts the active marker set for a track. */
export function setActiveMarkers(
  trackId: string,
  markers: ActiveMarkers,
): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO track_markers (trackId, markerA, markerB, loopEnabled)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(trackId) DO UPDATE SET
       markerA = excluded.markerA,
       markerB = excluded.markerB,
       loopEnabled = excluded.loopEnabled`,
    trackId,
    markers.markerA,
    markers.markerB,
    markers.loopEnabled ? 1 : 0,
  );
}

/** Removes a track's marker row. Used when a track is deleted. */
export function deleteMarkers(trackId: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM track_markers WHERE trackId = ?', trackId);
}

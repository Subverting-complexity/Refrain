import { ActiveMarkers, SegmentProfile, SegmentProfileInput } from '../types';
import { generateId } from '../utils/generateId';
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

// --- Segment profiles ------------------------------------------------------

interface ProfileRow {
  id: string;
  trackId: string;
  name: string;
  markerA: number | null;
  markerB: number | null;
  loopEnabled: number;
  createdAt: number;
}

function toProfile(row: ProfileRow): SegmentProfile {
  return {
    id: row.id,
    trackId: row.trackId,
    name: row.name,
    markerA: row.markerA,
    markerB: row.markerB,
    loopEnabled: row.loopEnabled === 1,
    createdAt: row.createdAt,
  };
}

/**
 * Lists a track's saved segment profiles in a stable order (oldest first,
 * then by id to break createdAt ties).
 */
export function listProfiles(trackId: string): SegmentProfile[] {
  const db = getDatabase();
  const rows = db.getAllSync<ProfileRow>(
    `SELECT id, trackId, name, markerA, markerB, loopEnabled, createdAt
       FROM marker_profiles
      WHERE trackId = ?
      ORDER BY createdAt ASC, id ASC`,
    trackId,
  );
  return rows.map(toProfile);
}

/** Saves a new segment profile for a track and returns the stored record. */
export function saveProfile(
  trackId: string,
  input: SegmentProfileInput,
): SegmentProfile {
  const db = getDatabase();
  const profile: SegmentProfile = {
    id: generateId(),
    trackId,
    name: input.name,
    markerA: input.markerA,
    markerB: input.markerB,
    loopEnabled: input.loopEnabled,
    createdAt: Date.now(),
  };
  db.runSync(
    `INSERT INTO marker_profiles
       (id, trackId, name, markerA, markerB, loopEnabled, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    profile.id,
    profile.trackId,
    profile.name,
    profile.markerA,
    profile.markerB,
    profile.loopEnabled ? 1 : 0,
    profile.createdAt,
  );
  return profile;
}

/**
 * Overwrites a profile's region (A/B markers and loop flag) by id, leaving its
 * name and `createdAt` untouched. Used when the player saves edited markers
 * back over the loaded segment.
 */
export function updateProfile(
  profileId: string,
  region: Pick<SegmentProfile, 'markerA' | 'markerB' | 'loopEnabled'>,
): void {
  const db = getDatabase();
  db.runSync(
    `UPDATE marker_profiles
        SET markerA = ?, markerB = ?, loopEnabled = ?
      WHERE id = ?`,
    region.markerA,
    region.markerB,
    region.loopEnabled ? 1 : 0,
    profileId,
  );
}

/** Renames an existing profile by id. */
export function renameProfile(profileId: string, name: string): void {
  const db = getDatabase();
  db.runSync(
    'UPDATE marker_profiles SET name = ? WHERE id = ?',
    name,
    profileId,
  );
}

/** Deletes a single profile by id. */
export function deleteProfile(profileId: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM marker_profiles WHERE id = ?', profileId);
}

/** Removes all profiles for a track. Used when a track is deleted. */
export function deleteProfilesForTrack(trackId: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM marker_profiles WHERE trackId = ?', trackId);
}

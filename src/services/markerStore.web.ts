import { ActiveMarkers, SegmentProfile, SegmentProfileInput } from '../types';
import { generateId } from '../utils/generateId';
import {
  deleteStoredMarkers,
  deleteStoredProfile,
  deleteStoredProfilesByTrack,
  getStoredMarkers,
  getStoredProfile,
  getStoredProfilesByTrack,
  putStoredMarkers,
  putStoredProfile,
  StoredProfile,
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

// --- Segment profiles ------------------------------------------------------

function toProfile(stored: StoredProfile): SegmentProfile {
  return {
    id: stored.id,
    trackId: stored.trackId,
    name: stored.name,
    markerA: stored.markerA,
    markerB: stored.markerB,
    loopEnabled: stored.loopEnabled,
    createdAt: stored.createdAt,
  };
}

/**
 * Lists a track's saved segment profiles in a stable order (oldest first,
 * then by id to break createdAt ties). The `trackId` index is unordered, so
 * the sort is applied here.
 */
export async function listProfiles(trackId: string): Promise<SegmentProfile[]> {
  const rows = await getStoredProfilesByTrack(trackId);
  return rows
    .map(toProfile)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** Saves a new segment profile for a track and returns the stored record. */
export async function saveProfile(
  trackId: string,
  input: SegmentProfileInput,
): Promise<SegmentProfile> {
  const profile: SegmentProfile = {
    id: generateId(),
    trackId,
    name: input.name,
    markerA: input.markerA,
    markerB: input.markerB,
    loopEnabled: input.loopEnabled,
    createdAt: Date.now(),
  };
  await putStoredProfile(profile);
  return profile;
}

/** Renames an existing profile by id. No-ops if the profile is gone. */
export async function renameProfile(
  profileId: string,
  name: string,
): Promise<void> {
  const existing = await getStoredProfile(profileId);
  if (!existing) return;
  await putStoredProfile({ ...existing, name });
}

/** Deletes a single profile by id. */
export async function deleteProfile(profileId: string): Promise<void> {
  await deleteStoredProfile(profileId);
}

/** Removes all profiles for a track. Used when a track is deleted. */
export async function deleteProfilesForTrack(trackId: string): Promise<void> {
  await deleteStoredProfilesByTrack(trackId);
}

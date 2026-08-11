import { SegmentProfile, SegmentProfileInput } from '../types';
import { generateId } from '../utils/generateId';

export function buildProfile(
  trackId: string,
  input: SegmentProfileInput,
): SegmentProfile {
  return {
    id: generateId(),
    trackId,
    name: input.name,
    markerA: input.markerA,
    markerB: input.markerB,
    loopEnabled: input.loopEnabled,
    createdAt: Date.now(),
  };
}

export function compareProfiles(a: SegmentProfile, b: SegmentProfile): number {
  // Tie-break equal timestamps by binary id comparison (not localeCompare) so
  // the web sort order matches the native SQL `ORDER BY createdAt ASC, id ASC`
  // (SQLite compares ids with binary collation).
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

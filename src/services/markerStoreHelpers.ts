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
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

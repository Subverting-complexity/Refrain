import { SegmentProfile } from '../types';

/**
 * Suggest the default name for the next saved segment: `Segment N`, where
 * `N` is one past the highest existing `Segment <number>` name. Profiles named
 * anything else are ignored, so the counter stays stable even after renames or
 * deletes (e.g. deleting `Segment 1` while `Segment 2` remains still yields
 * `Segment 3`). With no matching names it starts at `Segment 1`.
 */
export function nextSegmentName(profiles: SegmentProfile[]): string {
  let highest = 0;
  for (const profile of profiles) {
    const match = /^Segment (\d+)$/.exec(profile.name);
    if (match) {
      const index = Number(match[1]);
      if (index > highest) highest = index;
    }
  }
  return `Segment ${highest + 1}`;
}

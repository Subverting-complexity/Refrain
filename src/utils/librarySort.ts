import { SortDirection, SortKey, SortOption, Track } from '../types';

/**
 * Ordering the track list, and reading the stored preference back.
 *
 * Kept out of the screen so it can be tested directly: the ordering rules
 * here — particularly where never-played tracks land — are the kind that
 * read as broken when they go wrong and are invisible in a render test.
 */

export const SORT_KEYS: readonly SortKey[] = [
  'added',
  'played',
  'name',
  'length',
];

/**
 * The direction a key starts in when the reader switches to it. Each is the
 * answer to what someone means when they first tap that chip: the newest
 * imports, the most recently played, names from A, longest first.
 *
 * Direction is never carried across from the previous key. Tapping `Name`
 * after `Added` descending must not silently produce Z to A.
 */
export const NATURAL_DIRECTION: Record<SortKey, SortDirection> = {
  added: 'desc',
  played: 'desc',
  name: 'asc',
  length: 'desc',
};

export const DEFAULT_SORT: SortOption = { key: 'added', direction: 'desc' };

function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && SORT_KEYS.includes(value as SortKey);
}

function isDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc';
}

/**
 * Reads the persisted sort preference.
 *
 * The stored value used to be a bare string such as `date-desc`, or
 * `manual` back when tracks carried a hand-maintained order. Manual order no
 * longer exists, so anything that is not valid JSON of the current shape
 * falls back to the default rather than stranding the reader on a sort the
 * app can no longer perform.
 */
export function parseSortOption(raw: string | null | undefined): SortOption {
  if (!raw) return DEFAULT_SORT;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SORT;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SORT;
  const { key, direction } = parsed as Record<string, unknown>;
  if (!isSortKey(key) || !isDirection(direction)) return DEFAULT_SORT;
  return { key, direction };
}

export function serializeSortOption(option: SortOption): string {
  return JSON.stringify(option);
}

/**
 * The sort produced by tapping `key` when it is not already active — its own
 * natural direction, never the direction the previous key happened to be in.
 */
export function selectKey(key: SortKey): SortOption {
  return { key, direction: NATURAL_DIRECTION[key] };
}

/** Tapping the active chip reverses it. */
export function invert(option: SortOption): SortOption {
  return {
    key: option.key,
    direction: option.direction === 'asc' ? 'desc' : 'asc',
  };
}

function compareBy(key: SortKey, a: Track, b: Track): number {
  switch (key) {
    case 'name':
      return a.filename.localeCompare(b.filename);
    case 'length':
      return a.durationMs - b.durationMs;
    case 'played':
      // Only reached for tracks that have both been played; the nulls are
      // partitioned out before this runs.
      return (a.lastPlayedAt ?? 0) - (b.lastPlayedAt ?? 0);
    case 'added':
    default:
      return a.importedAt - b.importedAt;
  }
}

/**
 * Orders a list of tracks. Pure, and never mutates its argument.
 *
 * Under the `played` sort, tracks that have never been played sort last in
 * *both* directions, ordered among themselves by import time descending.
 * Treating a null timestamp as zero would be wrong: inverting would then
 * dump every never-played track at the top of the list, which is never what
 * reversing "most recently played" is meant to ask for. Direction reorders
 * only the tracks that have actually been played.
 */
export function sortTracks(tracks: Track[], sort: SortOption): Track[] {
  const factor = sort.direction === 'asc' ? 1 : -1;

  if (sort.key !== 'played') {
    return [...tracks].sort((a, b) => factor * compareBy(sort.key, a, b));
  }

  const played: Track[] = [];
  const unplayed: Track[] = [];
  for (const track of tracks) {
    (track.lastPlayedAt === null ? unplayed : played).push(track);
  }

  played.sort((a, b) => factor * compareBy('played', a, b));
  unplayed.sort((a, b) => b.importedAt - a.importedAt);
  return [...played, ...unplayed];
}

/**
 * Where the divider between played and never-played tracks falls, or null
 * when there is no boundary to draw. Lets the list mark the unplayed group
 * so its fixed position reads as deliberate rather than as a sort that has
 * gone wrong.
 */
export function unplayedBoundary(
  tracks: Track[],
  sort: SortOption,
): number | null {
  if (sort.key !== 'played') return null;
  const index = tracks.findIndex((t) => t.lastPlayedAt === null);
  if (index <= 0) return null;
  return index;
}

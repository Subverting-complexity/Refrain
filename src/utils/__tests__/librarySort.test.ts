import { Track } from '../../types';
import {
  DEFAULT_SORT,
  invert,
  NATURAL_DIRECTION,
  parseSortOption,
  selectKey,
  serializeSortOption,
  sortTracks,
  unplayedBoundary,
} from '../librarySort';

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    filename: `${id}.mp3`,
    uri: `file:///${id}.mp3`,
    format: 'mp3',
    durationMs: 1_000,
    durationEstimated: false,
    fileSizeBytes: 100,
    importedAt: 1_000,
    folderId: null,
    isFavorite: false,
    lastPlayedAt: null,
    ...overrides,
  };
}

const ids = (tracks: Track[]) => tracks.map((t) => t.id);

describe('parseSortOption', () => {
  it('reads back what serializeSortOption wrote', () => {
    const option = { key: 'name', direction: 'asc' } as const;
    expect(parseSortOption(serializeSortOption(option))).toEqual(option);
  });

  it('falls back when nothing is stored', () => {
    expect(parseSortOption(null)).toEqual(DEFAULT_SORT);
    expect(parseSortOption(undefined)).toEqual(DEFAULT_SORT);
    expect(parseSortOption('')).toEqual(DEFAULT_SORT);
  });

  // The stored value used to be a bare string. `manual` is the one that
  // matters: hand-maintained track order no longer exists, so a reader who
  // last used it must not be stranded on a sort the app cannot perform.
  it.each(['date-desc', 'manual', 'name-asc', 'not json at all'])(
    'falls back for the legacy value %p',
    (raw) => {
      expect(parseSortOption(raw)).toEqual(DEFAULT_SORT);
    },
  );

  it.each([
    ['a key that does not exist', '{"key":"size","direction":"asc"}'],
    ['a direction that does not exist', '{"key":"name","direction":"up"}'],
    ['a missing direction', '{"key":"name"}'],
    ['a non-object', '"name-asc"'],
    ['null', 'null'],
  ])('falls back for %s', (_label, raw) => {
    expect(parseSortOption(raw)).toEqual(DEFAULT_SORT);
  });
});

describe('selectKey and invert', () => {
  // Direction is never carried across from the previous key: tapping Name
  // after Added descending must not silently produce Z to A.
  it.each(['added', 'played', 'name', 'length'] as const)(
    'starts %s at its own natural direction',
    (key) => {
      expect(selectKey(key)).toEqual({
        key,
        direction: NATURAL_DIRECTION[key],
      });
    },
  );

  it('reverses without changing the key', () => {
    expect(invert({ key: 'name', direction: 'asc' })).toEqual({
      key: 'name',
      direction: 'desc',
    });
    expect(invert({ key: 'name', direction: 'desc' })).toEqual({
      key: 'name',
      direction: 'asc',
    });
  });
});

describe('sortTracks', () => {
  it('does not mutate its argument', () => {
    const tracks = [track('b'), track('a')];
    const before = [...tracks];
    sortTracks(tracks, { key: 'name', direction: 'asc' });
    expect(tracks).toEqual(before);
  });

  it('orders by name in both directions', () => {
    const tracks = [
      track('b', { filename: 'beta.mp3' }),
      track('a', { filename: 'alpha.mp3' }),
      track('c', { filename: 'gamma.mp3' }),
    ];
    expect(ids(sortTracks(tracks, { key: 'name', direction: 'asc' }))).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(ids(sortTracks(tracks, { key: 'name', direction: 'desc' }))).toEqual(
      ['c', 'b', 'a'],
    );
  });

  it('orders by import time, newest first when descending', () => {
    const tracks = [
      track('old', { importedAt: 1 }),
      track('new', { importedAt: 3 }),
      track('mid', { importedAt: 2 }),
    ];
    expect(
      ids(sortTracks(tracks, { key: 'added', direction: 'desc' })),
    ).toEqual(['new', 'mid', 'old']);
  });

  it('orders by duration, longest first when descending', () => {
    const tracks = [
      track('short', { durationMs: 1 }),
      track('long', { durationMs: 9 }),
    ];
    expect(
      ids(sortTracks(tracks, { key: 'length', direction: 'desc' })),
    ).toEqual(['long', 'short']);
  });

  describe('the played sort', () => {
    const tracks = [
      track('never-old', { lastPlayedAt: null, importedAt: 1 }),
      track('played-late', { lastPlayedAt: 300, importedAt: 2 }),
      track('never-new', { lastPlayedAt: null, importedAt: 5 }),
      track('played-early', { lastPlayedAt: 100, importedAt: 3 }),
    ];

    it('puts never-played tracks last, most recent first', () => {
      expect(
        ids(sortTracks(tracks, { key: 'played', direction: 'desc' })),
      ).toEqual(['played-late', 'played-early', 'never-new', 'never-old']);
    });

    // The rule this exists to protect. Treating a null timestamp as zero
    // would put every never-played track at the top the moment the reader
    // reversed the sort, which is never what reversing "most recently
    // played" is asking for.
    it('keeps never-played tracks last when reversed', () => {
      expect(
        ids(sortTracks(tracks, { key: 'played', direction: 'asc' })),
      ).toEqual(['played-early', 'played-late', 'never-new', 'never-old']);
    });

    it('orders the never-played group by import time, newest first, in both directions', () => {
      for (const direction of ['asc', 'desc'] as const) {
        const sorted = ids(sortTracks(tracks, { key: 'played', direction }));
        expect(sorted.slice(-2)).toEqual(['never-new', 'never-old']);
      }
    });
  });
});

describe('unplayedBoundary', () => {
  it('is null unless the played sort is active', () => {
    const tracks = [track('a', { lastPlayedAt: 1 }), track('b')];
    expect(unplayedBoundary(tracks, { key: 'added', direction: 'desc' })).toBe(
      null,
    );
  });

  it('marks where the never-played group begins', () => {
    const tracks = [
      track('a', { lastPlayedAt: 2 }),
      track('b', { lastPlayedAt: 1 }),
      track('c'),
    ];
    expect(unplayedBoundary(tracks, { key: 'played', direction: 'desc' })).toBe(
      2,
    );
  });

  // No boundary to draw when every track is on one side of it: a divider
  // above the first row, or none at all, would be noise.
  it('is null when every track has been played', () => {
    const tracks = [track('a', { lastPlayedAt: 1 })];
    expect(unplayedBoundary(tracks, { key: 'played', direction: 'desc' })).toBe(
      null,
    );
  });

  it('is null when no track has been played', () => {
    const tracks = [track('a'), track('b')];
    expect(unplayedBoundary(tracks, { key: 'played', direction: 'desc' })).toBe(
      null,
    );
  });
});

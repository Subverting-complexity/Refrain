/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @jest-environment node
 *
 * Web metadata persistence, backed by IndexedDB. Exercised against
 * `fake-indexeddb` so the real object-store logic (not a mock) is covered.
 */
import { IDBFactory } from 'fake-indexeddb';

import type { StoredTrack } from '../database.web';

type DatabaseModule = typeof import('../database.web');

beforeEach(() => {
  // Fresh IndexedDB and a fresh module instance (resets the cached db promise)
  // for every test.
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  jest.resetModules();
});

function load(): DatabaseModule {
  return require('../database.web');
}

const sampleTrack: StoredTrack = {
  id: 'track-1',
  filename: 'song.mp3',
  format: 'mp3',
  durationMs: 42_000,
  durationEstimated: true,
  fileSizeBytes: 1_000_000,
  importedAt: 1_700_000_000_000,
};

describe('tracks store', () => {
  it('round-trips a track record', async () => {
    const db = load();
    await db.putStoredTrack(sampleTrack);
    expect(await db.getStoredTrack('track-1')).toEqual(sampleTrack);
  });

  it('returns null for an absent track', async () => {
    const db = load();
    expect(await db.getStoredTrack('missing')).toBeNull();
  });

  it('overwrites an existing track on put (same id)', async () => {
    const db = load();
    await db.putStoredTrack(sampleTrack);
    await db.putStoredTrack({
      ...sampleTrack,
      durationMs: 50_000,
      durationEstimated: false,
    });
    const updated = await db.getStoredTrack('track-1');
    expect(updated?.durationMs).toBe(50_000);
    expect(updated?.durationEstimated).toBe(false);
  });

  it('lists all tracks and all ids', async () => {
    const db = load();
    await db.putStoredTrack(sampleTrack);
    await db.putStoredTrack({ ...sampleTrack, id: 'track-2' });

    const all = await db.getAllStoredTracks();
    expect(all).toHaveLength(2);
    expect(new Set(await db.getStoredTrackIds())).toEqual(
      new Set(['track-1', 'track-2']),
    );
  });

  it('deletes a track', async () => {
    const db = load();
    await db.putStoredTrack(sampleTrack);
    await db.deleteStoredTrack('track-1');
    expect(await db.getStoredTrack('track-1')).toBeNull();
    expect(await db.getAllStoredTracks()).toEqual([]);
  });
});

describe('markers store', () => {
  const sampleMarkers = {
    trackId: 'track-1',
    markerA: 1000,
    markerB: 5000,
    loopEnabled: true,
  };

  it('round-trips a marker record', async () => {
    const db = load();
    await db.putStoredMarkers(sampleMarkers);
    expect(await db.getStoredMarkers('track-1')).toEqual(sampleMarkers);
  });

  it('returns null for an absent marker record', async () => {
    const db = load();
    expect(await db.getStoredMarkers('missing')).toBeNull();
  });

  it('overwrites an existing marker record on put (same trackId)', async () => {
    const db = load();
    await db.putStoredMarkers(sampleMarkers);
    await db.putStoredMarkers({ ...sampleMarkers, markerB: 9000 });
    expect(await db.getStoredMarkers('track-1')).toEqual({
      ...sampleMarkers,
      markerB: 9000,
    });
  });

  it('deletes a marker record', async () => {
    const db = load();
    await db.putStoredMarkers(sampleMarkers);
    await db.deleteStoredMarkers('track-1');
    expect(await db.getStoredMarkers('track-1')).toBeNull();
  });
});

describe('schema upgrade', () => {
  it('keeps tracks and settings stores alongside the new markers store', async () => {
    const db = load();
    // All three stores are usable after the v2 upgrade — exercising each
    // proves the bump did not drop the pre-existing tracks/settings stores.
    await db.putStoredTrack(sampleTrack);
    await db.putStoredSetting('volume', '0.5');
    await db.putStoredMarkers({
      trackId: 'track-1',
      markerA: 1,
      markerB: 2,
      loopEnabled: true,
    });

    expect(await db.getStoredTrack('track-1')).toEqual(sampleTrack);
    expect(await db.getAllStoredSettings()).toEqual([
      { key: 'volume', value: '0.5' },
    ]);
    expect(await db.getStoredMarkers('track-1')).not.toBeNull();
  });
});

describe('settings store', () => {
  it('round-trips a setting and overwrites on the same key', async () => {
    const db = load();
    await db.putStoredSetting('volume', '0.5');
    expect(await db.getAllStoredSettings()).toEqual([
      { key: 'volume', value: '0.5' },
    ]);

    await db.putStoredSetting('volume', '0.8');
    expect(await db.getAllStoredSettings()).toEqual([
      { key: 'volume', value: '0.8' },
    ]);
  });

  it('returns an empty list when no settings are stored', async () => {
    const db = load();
    expect(await db.getAllStoredSettings()).toEqual([]);
  });
});

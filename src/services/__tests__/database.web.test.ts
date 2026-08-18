/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @jest-environment node
 *
 * Web metadata persistence, backed by IndexedDB. Exercised against
 * `fake-indexeddb` so the real object-store logic (not a mock) is covered.
 */
// `IDBObjectStore` re-exported here is fake-indexeddb's concrete store class
// (`FDBObjectStore`); spying on its prototype lets the abort test intercept a
// real `put`.
import { IDBFactory, IDBObjectStore as FDBObjectStore } from 'fake-indexeddb';

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
  folderId: null,
  isFavorite: false,
  lastPlayedAt: null,
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

describe('transaction lifecycle', () => {
  it('rejects when the transaction aborts after the request succeeds', async () => {
    const db = load();

    // Simulate a commit-time failure (e.g. storage quota exceeded): the put
    // request reports success, but the transaction then aborts before it
    // commits. The wrapper must reject rather than resolve on the earlier
    // request success. Spy on `put` so the very next put aborts its
    // transaction the moment the request fires its success event.
    const realPut = FDBObjectStore.prototype.put;
    const putSpy = jest
      .spyOn(FDBObjectStore.prototype, 'put')
      .mockImplementationOnce(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = realPut.call(this, value, key);
        const tx = this.transaction;
        request.addEventListener('success', () => tx.abort());
        return request;
      });

    try {
      await expect(db.putStoredTrack(sampleTrack)).rejects.toBeDefined();
    } finally {
      putSpy.mockRestore();
    }
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

/**
 * Builds a v4 database by hand — the shape this release upgrades from —
 * seeds it with nested folders and pre-favourite tracks, then closes it so
 * the module under test opens it at v5 and runs the upgrade.
 */
function seedV4(): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('refrain-meta', 4);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore('tracks', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('track_markers', { keyPath: 'trackId' });
      const profiles = db.createObjectStore('marker_profiles', {
        keyPath: 'id',
      });
      profiles.createIndex('trackId', 'trackId', { unique: false });
      const folders = db.createObjectStore('folders', { keyPath: 'id' });
      folders.createIndex('parentId', 'parentId', { unique: false });
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['tracks', 'folders'], 'readwrite');
      tx.objectStore('tracks').put({
        id: 'track-1',
        filename: 'song.mp3',
        format: 'mp3',
        durationMs: 42_000,
        durationEstimated: true,
        fileSizeBytes: 1_000_000,
        importedAt: 1_700_000_000_000,
        folderId: null,
        sortOrder: 7,
      });
      tx.objectStore('folders').put({
        id: 'parent',
        name: 'Gigs',
        parentId: null,
        createdAt: 100,
        sortOrder: 0,
      });
      tx.objectStore('folders').put({
        id: 'child',
        name: 'March',
        parentId: 'parent',
        createdAt: 200,
        sortOrder: 1,
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  });
}

describe('upgrade from v4', () => {
  it('promotes every nested folder to the top level, keeping its name', async () => {
    await seedV4();
    const db = load();

    const folders = await db.getAllStoredFolders();

    expect(folders.map((f) => f.name).sort()).toEqual(['Gigs', 'March']);
    for (const folder of folders) {
      expect(folder).not.toHaveProperty('parentId');
    }
  });

  it('merges, renames and deletes nothing while flattening', async () => {
    await seedV4();
    const db = load();

    const folders = await db.getAllStoredFolders();

    expect(folders).toHaveLength(2);
    expect(folders.find((f) => f.id === 'child')?.name).toBe('March');
    expect(folders.find((f) => f.id === 'parent')?.name).toBe('Gigs');
  });

  it('gives folders a pin slot and an open time derived from creation', async () => {
    await seedV4();
    const db = load();

    const folders = await db.getAllStoredFolders();
    const child = folders.find((f) => f.id === 'child')!;

    expect(child.pinOrder).toBeNull();
    expect(child.lastOpenedAt).toBe(200);
  });

  it('gives tracks the favourite and play-time fields and drops sortOrder', async () => {
    await seedV4();
    const db = load();

    const track = await db.getStoredTrack('track-1');

    expect(track?.isFavorite).toBe(false);
    expect(track?.lastPlayedAt).toBeNull();
    expect(track).not.toHaveProperty('sortOrder');
  });

  it('leaves the rest of a track record byte-identical', async () => {
    await seedV4();
    const db = load();

    const track = await db.getStoredTrack('track-1');

    expect(track).toMatchObject({
      id: 'track-1',
      filename: 'song.mp3',
      format: 'mp3',
      durationMs: 42_000,
      durationEstimated: true,
      fileSizeBytes: 1_000_000,
      importedAt: 1_700_000_000_000,
      folderId: null,
    });
  });
});

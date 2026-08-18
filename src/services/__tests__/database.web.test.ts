/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @jest-environment node
 *
 * Web metadata persistence, backed by IndexedDB. Exercised against
 * `fake-indexeddb` so the real object-store logic (not a mock) is covered.
 */
// The classes re-exported here are fake-indexeddb's concrete implementations
// (`FDBObjectStore`, `FDBDatabase`); spying on their prototypes lets a test
// intercept a real `put`, count real transactions, or watch a real `close`.
import {
  IDBDatabase as FDBDatabase,
  IDBFactory,
  IDBObjectStore as FDBObjectStore,
} from 'fake-indexeddb';

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

/**
 * Builds a v3 database — before the folders store existed at all — with a
 * track record that predates `folderId`. This is the riskier upgrade route:
 * the migration reads a folders store created moments earlier in the same
 * version-change transaction, and track records missing fields it defaults.
 */
function seedV3(): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('refrain-meta', 3);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore('tracks', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('track_markers', { keyPath: 'trackId' });
      const profiles = db.createObjectStore('marker_profiles', {
        keyPath: 'id',
      });
      profiles.createIndex('trackId', 'trackId', { unique: false });
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put({
        id: 'legacy-1',
        filename: 'old.mp3',
        format: 'mp3',
        durationMs: 1_000,
        durationEstimated: true,
        fileSizeBytes: 10,
        importedAt: 1,
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

describe('upgrade from v3', () => {
  it('creates the folders store empty rather than failing', async () => {
    await seedV3();
    const db = load();

    await expect(db.getAllStoredFolders()).resolves.toEqual([]);
  });

  it('defaults the fields a v3 track record never had', async () => {
    await seedV3();
    const db = load();

    const track = await db.getStoredTrack('legacy-1');

    expect(track?.folderId).toBeNull();
    expect(track?.isFavorite).toBe(false);
    expect(track?.lastPlayedAt).toBeNull();
  });
});

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

  it('writes a rearranged pinned block in one transaction', async () => {
    await seedV4();
    const db = load();
    // Open the database before the spy goes on, so the only transaction it
    // counts is the batch's own. Asserting that the records simply arrived
    // would pass just as well against a write-each-folder-separately
    // version, which is the implementation this test exists to rule out.
    await db.getAllStoredFolders();
    const txSpy = jest.spyOn(FDBDatabase.prototype, 'transaction');

    await db.putStoredFolders([
      {
        id: 'parent',
        name: 'Gigs',
        createdAt: 100,
        pinOrder: 1,
        lastOpenedAt: 100,
      },
      {
        id: 'child',
        name: 'March',
        createdAt: 200,
        pinOrder: 0,
        lastOpenedAt: 200,
      },
    ]);

    expect(txSpy).toHaveBeenCalledTimes(1);
    txSpy.mockRestore();

    const folders = await db.getAllStoredFolders();
    expect(folders.find((f) => f.id === 'parent')?.pinOrder).toBe(1);
    expect(folders.find((f) => f.id === 'child')?.pinOrder).toBe(0);
  });

  it('moves no folder at all when the batch aborts partway through', async () => {
    await seedV4();
    const db = load();

    // The point of the single transaction is that a rearrangement lands
    // whole or not at all. Abort on the second write and confirm the first
    // rolled back with it, rather than leaving a mix of old and new
    // positions behind — the state that produces duplicate pin slots.
    const realPut = FDBObjectStore.prototype.put;
    let writes = 0;
    const putSpy = jest
      .spyOn(FDBObjectStore.prototype, 'put')
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = realPut.call(this, value, key);
        writes += 1;
        if (writes === 2) this.transaction.abort();
        return request;
      });

    try {
      await expect(
        db.putStoredFolders([
          {
            id: 'parent',
            name: 'Gigs',
            createdAt: 100,
            pinOrder: 1,
            lastOpenedAt: 100,
          },
          {
            id: 'child',
            name: 'March',
            createdAt: 200,
            pinOrder: 0,
            lastOpenedAt: 200,
          },
        ]),
      ).rejects.toBeDefined();
    } finally {
      putSpy.mockRestore();
    }

    const folders = await db.getAllStoredFolders();
    expect(folders.map((f) => f.pinOrder)).toEqual([null, null]);
  });

  it('writing an empty batch touches nothing', async () => {
    await seedV4();
    const db = load();

    await expect(db.putStoredFolders([])).resolves.toBeUndefined();
    await expect(db.getAllStoredFolders()).resolves.toHaveLength(2);
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

/**
 * Opens the v4 database and leaves the connection open, standing in for a
 * second browser tab still running the previous release. An upgrade to v5
 * cannot proceed while that connection is held, which is what makes the
 * open request fire `blocked`.
 */
function holdV4Connection(): Promise<IDBDatabase> {
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
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

/** Reads a database's current version without upgrading it. */
function versionOf(name: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onsuccess = () => {
      const { version } = open.result;
      open.result.close();
      resolve(version);
    };
    open.onerror = () => reject(open.error);
  });
}

/**
 * Lets fake-indexeddb work through its queued events. Used where the thing
 * under test happens after the promise has already settled, so there is no
 * promise left to await.
 */
async function flushEvents(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('opening the database', () => {
  it('aborts the upgrade when there is no version-change transaction', async () => {
    await seedV4();

    // The specification guarantees a transaction here, so the guard can only
    // be reached by taking it away. Without the guard the version would
    // reach 5 with unmigrated records, and the version is itself what stops
    // the migration ever running again.
    const realOpen = indexedDB.open.bind(indexedDB);
    const openSpy = jest
      .spyOn(indexedDB, 'open')
      .mockImplementationOnce((name: string, version?: number) => {
        const request = realOpen(name, version);
        // A no-op setter as well as the getter: fake-indexeddb assigns the
        // real transaction here on its way into the upgrade, and a
        // getter-only property makes that assignment throw inside the
        // library rather than inside the code under test.
        Object.defineProperty(request, 'transaction', {
          configurable: true,
          get: () => null,
          set: () => {},
        });
        return request;
      });

    const db = load();
    try {
      await expect(db.getAllStoredTracks()).rejects.toBeDefined();
    } finally {
      openSpy.mockRestore();
    }

    // The aborted upgrade rolls the version back, so the records are still
    // there in their v4 shape rather than half migrated.
    expect(await versionOf('refrain-meta')).toBe(4);
  });

  it('rejects with an explanation when another tab holds the old version open', async () => {
    const holder = await holdV4Connection();
    const db = load();

    try {
      await expect(db.getAllStoredTracks()).rejects.toThrow(
        /open in another tab/,
      );
    } finally {
      holder.close();
    }
  });

  it('closes the connection a blocked upgrade left behind', async () => {
    const holder = await holdV4Connection();
    const db = load();
    await expect(db.getAllStoredTracks()).rejects.toThrow(
      /open in another tab/,
    );

    // Rejecting did not cancel the open request. Once the other tab closes,
    // the upgrade goes ahead and hands back a connection nothing is waiting
    // for; left open it would sit there for the rest of the page session,
    // one more for every retry.
    holder.close();
    const closeSpy = jest.spyOn(FDBDatabase.prototype, 'close');
    try {
      await flushEvents();
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
    }
  });

  it('opens again after a failed open rather than replaying the rejection', async () => {
    const db = load();

    // Private browsing or a denied storage permission fails the open. A
    // cached rejection would then fail every later call for the rest of the
    // page session, with no way to try again.
    const openSpy = jest.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new Error('storage is not available');
    });

    await expect(db.getAllStoredTracks()).rejects.toThrow(
      'storage is not available',
    );
    openSpy.mockRestore();

    await expect(db.getAllStoredTracks()).resolves.toEqual([]);
  });
});

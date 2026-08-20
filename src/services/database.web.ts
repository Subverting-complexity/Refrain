/**
 * Web persistence for track metadata and settings, backed by IndexedDB.
 *
 * Native uses expo-sqlite, but on web expo-sqlite's wasm backend stores the
 * database in OPFS through a worker that acquires *exclusive*, per-origin sync
 * access handles. That backend is fragile in the browser: its synchronous API
 * busy-waits the main thread and times out, and when OPFS handle acquisition
 * fails (a second tab, a stale worker, locked/corrupt files) the worker wedges
 * for the rest of the page load — even an in-memory fallback then fails with
 * "Invalid VFS state". IndexedDB has none of these problems: it is multi-tab
 * safe, survives reloads, needs no worker or cross-origin isolation, and is
 * already used here for audio blobs (see `webBlobStore.web`). So web metadata
 * lives in IndexedDB too.
 *
 * Four object stores, each keyed by its natural id:
 *   - `tracks`          — one record per imported track (keyPath `id`).
 *   - `settings`        — key/value app preferences (keyPath `key`).
 *   - `track_markers`   — active A/B markers per track (keyPath `trackId`).
 *   - `marker_profiles` — named A/B segment profiles (keyPath `id`, with a
 *                         non-unique `trackId` index for per-track lookup).
 *   - `folders`         — one record per folder (keyPath `id`). Single level:
 *                         folders do not contain other folders.
 */

import { createIdbConnection } from './idb.web';

const DB_NAME = 'refrain-meta';
// v2 adds the `track_markers` store; v3 adds `marker_profiles`; v4 adds
// `folders`; v5 flattens folder nesting and adds the favourite, play-time,
// pin and open-time fields. The upgrade handler creates stores conditionally
// and migrates records in the version-change transaction, so bumping the
// version leaves existing data intact.
const DB_VERSION = 5;
const TRACKS_STORE = 'tracks';
const SETTINGS_STORE = 'settings';
const MARKERS_STORE = 'track_markers';
const PROFILES_STORE = 'marker_profiles';
const PROFILES_TRACK_INDEX = 'trackId';
const FOLDERS_STORE = 'folders';

/**
 * Persisted shape of a track. The playable `uri` is intentionally not stored:
 * it is a volatile `blob:` object URL resolved from the audio blob at load
 * time (see `trackStore.web`), so persisting it would only stale.
 */
export interface StoredTrack {
  id: string;
  filename: string;
  format: string;
  durationMs: number;
  durationEstimated: boolean;
  fileSizeBytes: number;
  importedAt: number;
  folderId: string | null;
  isFavorite: boolean;
  lastPlayedAt: number | null;
}

export interface StoredFolder {
  id: string;
  name: string;
  createdAt: number;
  pinOrder: number | null;
  lastOpenedAt: number | null;
}

export interface StoredSetting {
  key: string;
  value: string;
}

/** Persisted active A/B marker set for a single track, keyed by `trackId`. */
export interface StoredMarkers {
  trackId: string;
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
}

/** Persisted named A/B segment profile, keyed by its own `id`. */
export interface StoredProfile {
  id: string;
  trackId: string;
  name: string;
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
  createdAt: number;
}

/**
 * Brings v4 records up to the v5 shape, inside the version-change
 * transaction so the database is never readable in a half-migrated state.
 *
 * Tracks gain `isFavorite` and `lastPlayedAt` and lose the now-unused
 * `sortOrder`. Folders are flattened — every folder becomes top level,
 * keeping its own name, so `Gigs > March` turns into two independent
 * folders — and gain `pinOrder` and `lastOpenedAt`. A folder that has never
 * been opened is stamped with its creation time so it sorts sensibly rather
 * than falling to the never-opened tail on first read.
 *
 * The `parentId` index goes with nesting. Unlike the native side, where
 * dropping a column would mean rebuilding the table, removing an IndexedDB
 * index is cheap, and the flatten makes it useless anyway.
 */
function migrateToV5(upgrade: IDBTransaction): void {
  const tracks = upgrade.objectStore(TRACKS_STORE);
  const trackCursor = tracks.openCursor();
  trackCursor.onsuccess = () => {
    const cursor = trackCursor.result;
    if (!cursor) return;
    const row = cursor.value as StoredTrack & { sortOrder?: number };
    delete row.sortOrder;
    cursor.update({
      ...row,
      folderId: row.folderId ?? null,
      isFavorite: row.isFavorite ?? false,
      lastPlayedAt: row.lastPlayedAt ?? null,
    });
    cursor.continue();
  };

  const folders = upgrade.objectStore(FOLDERS_STORE);
  if (folders.indexNames.contains('parentId')) {
    folders.deleteIndex('parentId');
  }
  const folderCursor = folders.openCursor();
  folderCursor.onsuccess = () => {
    const cursor = folderCursor.result;
    if (!cursor) return;
    const row = cursor.value as StoredFolder & {
      parentId?: string | null;
      sortOrder?: number;
    };
    delete row.parentId;
    delete row.sortOrder;
    cursor.update({
      ...row,
      pinOrder: row.pinOrder ?? null,
      lastOpenedAt: row.lastOpenedAt ?? row.createdAt ?? null,
    });
    cursor.continue();
  };
}

// Open/lifecycle/transaction plumbing is shared with `webBlobStore.web` —
// the guarantees (blocked-upgrade rejection, force-close recovery,
// commit-anchored settling) are documented once in `idb.web`.
const connection = createIdbConnection({
  name: DB_NAME,
  version: DB_VERSION,
  blockedMessage:
    'Refrain is open in another tab using an older version of its database. Close the other tab and reload.',
  upgrade: (db, upgrade, oldVersion) => {
    if (!db.objectStoreNames.contains(TRACKS_STORE)) {
      db.createObjectStore(TRACKS_STORE, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
      db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains(MARKERS_STORE)) {
      db.createObjectStore(MARKERS_STORE, { keyPath: 'trackId' });
    }
    if (!db.objectStoreNames.contains(PROFILES_STORE)) {
      const profiles = db.createObjectStore(PROFILES_STORE, {
        keyPath: 'id',
      });
      profiles.createIndex(PROFILES_TRACK_INDEX, 'trackId', {
        unique: false,
      });
    }
    if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
      db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
    }
    if (oldVersion > 0 && oldVersion < 5) {
      if (!upgrade) {
        // Cannot happen per the specification, but if it ever did the
        // version would reach 5 with unmigrated records and the version
        // itself is the guard, so the migration could never run again.
        // Throwing aborts the upgrade and rolls the version back.
        throw new Error('No version-change transaction to migrate in');
      }
      migrateToV5(upgrade);
    }
  },
});

function runTransaction<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return connection.runTransaction(store, mode, run);
}

// --- Tracks ---------------------------------------------------------------

export function getAllStoredTracks(): Promise<StoredTrack[]> {
  return runTransaction<StoredTrack[]>(TRACKS_STORE, 'readonly', (store) =>
    store.getAll(),
  );
}

export function getStoredTrack(id: string): Promise<StoredTrack | null> {
  return runTransaction<StoredTrack | undefined>(
    TRACKS_STORE,
    'readonly',
    (store) => store.get(id),
  ).then((track) => track ?? null);
}

export function putStoredTrack(track: StoredTrack): Promise<void> {
  return runTransaction(TRACKS_STORE, 'readwrite', (store) =>
    store.put(track),
  ).then(() => undefined);
}

/**
 * Writes several track records in one transaction, so a batch re-home lands
 * whole or not at all. Deleting a folder unfiles every track inside it;
 * writing them one at a time leaves some unfiled and the rest still pointing
 * at a folder that is about to disappear — and such a track appears in no
 * view at all, being neither unfiled nor inside an openable folder. The
 * native store does the same work in a single UPDATE.
 */
export function putStoredTracks(tracks: StoredTrack[]): Promise<void> {
  if (tracks.length === 0) return Promise.resolve();
  return connection.runBatchTransaction(TRACKS_STORE, 'readwrite', (store) => {
    for (const track of tracks) {
      store.put(track);
    }
  });
}

export function deleteStoredTrack(id: string): Promise<void> {
  return runTransaction(TRACKS_STORE, 'readwrite', (store) =>
    store.delete(id),
  ).then(() => undefined);
}

export function getStoredTrackIds(): Promise<string[]> {
  return runTransaction<IDBValidKey[]>(TRACKS_STORE, 'readonly', (store) =>
    store.getAllKeys(),
  ).then((keys) => keys.map((k) => String(k)));
}

// --- Markers --------------------------------------------------------------

export function getStoredMarkers(
  trackId: string,
): Promise<StoredMarkers | null> {
  return runTransaction<StoredMarkers | undefined>(
    MARKERS_STORE,
    'readonly',
    (store) => store.get(trackId),
  ).then((markers) => markers ?? null);
}

export function putStoredMarkers(markers: StoredMarkers): Promise<void> {
  return runTransaction(MARKERS_STORE, 'readwrite', (store) =>
    store.put(markers),
  ).then(() => undefined);
}

export function deleteStoredMarkers(trackId: string): Promise<void> {
  return runTransaction(MARKERS_STORE, 'readwrite', (store) =>
    store.delete(trackId),
  ).then(() => undefined);
}

// --- Profiles -------------------------------------------------------------

export function getStoredProfilesByTrack(
  trackId: string,
): Promise<StoredProfile[]> {
  return runTransaction<StoredProfile[]>(PROFILES_STORE, 'readonly', (store) =>
    store.index(PROFILES_TRACK_INDEX).getAll(trackId),
  );
}

export function getStoredProfile(id: string): Promise<StoredProfile | null> {
  return runTransaction<StoredProfile | undefined>(
    PROFILES_STORE,
    'readonly',
    (store) => store.get(id),
  ).then((profile) => profile ?? null);
}

export function putStoredProfile(profile: StoredProfile): Promise<void> {
  return runTransaction(PROFILES_STORE, 'readwrite', (store) =>
    store.put(profile),
  ).then(() => undefined);
}

export function deleteStoredProfile(id: string): Promise<void> {
  return runTransaction(PROFILES_STORE, 'readwrite', (store) =>
    store.delete(id),
  ).then(() => undefined);
}

/**
 * Removes every profile belonging to a track in a single transaction. Used by
 * the track-delete cascade. Resolving the keys through the `trackId` index and
 * deleting them within the same `readwrite` transaction keeps the removal
 * atomic.
 */
export function deleteStoredProfilesByTrack(trackId: string): Promise<void> {
  return connection.runBatchTransaction(
    PROFILES_STORE,
    'readwrite',
    (store) => {
      const keysRequest = store.index(PROFILES_TRACK_INDEX).getAllKeys(trackId);
      keysRequest.onsuccess = () => {
        for (const key of keysRequest.result) {
          store.delete(key);
        }
      };
    },
  );
}

// --- Folders --------------------------------------------------------------

export function getAllStoredFolders(): Promise<StoredFolder[]> {
  return runTransaction<StoredFolder[]>(FOLDERS_STORE, 'readonly', (store) =>
    store.getAll(),
  );
}

export function getStoredFolder(id: string): Promise<StoredFolder | null> {
  return runTransaction<StoredFolder | undefined>(
    FOLDERS_STORE,
    'readonly',
    (store) => store.get(id),
  ).then((folder) => folder ?? null);
}

export function putStoredFolder(folder: StoredFolder): Promise<void> {
  return runTransaction(FOLDERS_STORE, 'readwrite', (store) =>
    store.put(folder),
  ).then(() => undefined);
}

/**
 * Writes several folder records in a single transaction, so a rearranged
 * pinned block lands whole or not at all. Writing them one at a time would
 * leave a mix of old and new positions behind an interruption, including
 * duplicates — which is what the native implementation avoids by wrapping
 * its rewrite in a transaction.
 */
export function putStoredFolders(folders: StoredFolder[]): Promise<void> {
  if (folders.length === 0) return Promise.resolve();
  return connection.runBatchTransaction(FOLDERS_STORE, 'readwrite', (store) => {
    for (const folder of folders) {
      store.put(folder);
    }
  });
}

export function deleteStoredFolder(id: string): Promise<void> {
  return runTransaction(FOLDERS_STORE, 'readwrite', (store) =>
    store.delete(id),
  ).then(() => undefined);
}

// --- Settings -------------------------------------------------------------

export function getAllStoredSettings(): Promise<StoredSetting[]> {
  return runTransaction<StoredSetting[]>(SETTINGS_STORE, 'readonly', (store) =>
    store.getAll(),
  );
}

export function putStoredSetting(key: string, value: string): Promise<void> {
  return runTransaction(SETTINGS_STORE, 'readwrite', (store) =>
    store.put({ key, value }),
  ).then(() => undefined);
}

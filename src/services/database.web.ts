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
 */

const DB_NAME = 'refrain-meta';
// v2 adds the `track_markers` store; v3 adds `marker_profiles`. The upgrade
// handler creates stores conditionally, so bumping the version leaves existing
// `tracks`/`settings`/`track_markers` data intact.
const DB_VERSION = 3;
const TRACKS_STORE = 'tracks';
const SETTINGS_STORE = 'settings';
const MARKERS_STORE = 'track_markers';
const PROFILES_STORE = 'marker_profiles';
const PROFILES_TRACK_INDEX = 'trackId';

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

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function runTransaction<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = run(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
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
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PROFILES_STORE, 'readwrite');
        const store = tx.objectStore(PROFILES_STORE);
        const keysRequest = store
          .index(PROFILES_TRACK_INDEX)
          .getAllKeys(trackId);
        keysRequest.onsuccess = () => {
          for (const key of keysRequest.result) {
            store.delete(key);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
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

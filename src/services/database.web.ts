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
 * Two object stores, both keyed by their natural id:
 *   - `tracks`   — one record per imported track (keyPath `id`).
 *   - `settings` — key/value app preferences (keyPath `key`).
 */

const DB_NAME = 'refrain-meta';
const DB_VERSION = 1;
const TRACKS_STORE = 'tracks';
const SETTINGS_STORE = 'settings';

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

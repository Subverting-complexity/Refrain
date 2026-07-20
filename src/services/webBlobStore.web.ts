/**
 * Web-only binary store for imported audio. The native filesystem
 * (`expo-file-system`) does not exist in the browser, so audio bytes are
 * persisted as Blobs in IndexedDB (survives reload) and exposed to the
 * player as `blob:` object URLs created on demand.
 *
 * Object URLs are cached per track id so repeated library loads within a
 * page session reuse one URL instead of leaking a new one each time. They
 * are revoked when the track is deleted; the browser frees any remaining
 * URLs on page unload.
 */

const DB_NAME = 'refrain-audio';
const DB_VERSION = 1;
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        // A request can report success before the transaction commits, so
        // resolving on `request.onsuccess` would surface success even when the
        // commit later fails — for the large audio blobs stored here, a
        // quota-exceeded abort at commit time is the likeliest failure, and it
        // would leave the track's metadata written but its audio missing.
        // Capture the result on success, but only resolve once the transaction
        // actually commits (mirrors database.web.ts).
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () =>
          reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      }),
  );
}

/** Persist (or overwrite) the audio blob for a track id. */
export function putBlob(id: string, blob: Blob): Promise<void> {
  return runTransaction('readwrite', (store) => store.put(blob, id)).then(
    () => {
      revokeObjectUrl(id);
    },
  );
}

/** Read the audio blob for a track id, or null if absent. */
export function getBlob(id: string): Promise<Blob | null> {
  return runTransaction<Blob | undefined>('readonly', (store) =>
    store.get(id),
  ).then((blob) => blob ?? null);
}

/** Remove the audio blob for a track id. No-op if absent. */
export function deleteBlob(id: string): Promise<void> {
  return runTransaction('readwrite', (store) => store.delete(id)).then(
    () => undefined,
  );
}

/** List all stored track ids (the object-store keys). */
export function listBlobIds(): Promise<string[]> {
  return runTransaction<IDBValidKey[]>('readonly', (store) =>
    store.getAllKeys(),
  ).then((keys) => keys.map((k) => String(k)));
}

// --- Object-URL cache ----------------------------------------------------

const objectUrls = new Map<string, string>();

/**
 * Return a `blob:` object URL for a track id, creating and caching it on
 * first use. Returns null if no blob is stored for the id. Cached so the
 * same URL is reused across library reloads within a page session.
 */
export async function getObjectUrl(id: string): Promise<string | null> {
  const cached = objectUrls.get(id);
  if (cached) return cached;

  const blob = await getBlob(id);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  objectUrls.set(id, url);
  return url;
}

/** Revoke and forget the cached object URL for a track id, if any. */
export function revokeObjectUrl(id: string): void {
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
}

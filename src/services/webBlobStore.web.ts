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

/**
 * The same two lifecycle handlers `database.web` attaches, for the same
 * reasons: close on `versionchange` so this tab never blocks another tab's
 * upgrade, and drop the cache on `close` so a connection the browser
 * force-closes — storage cleared, or eviction under memory pressure — does
 * not leave every later blob read throwing `InvalidStateError` for the rest
 * of the page session. Each clears the cache only while it still refers to
 * this connection.
 */
function attachLifecycleHandlers(
  db: IDBDatabase,
  box: { promise?: Promise<IDBDatabase> },
): void {
  const clearIfCurrent = () => {
    if (dbPromise === box.promise) dbPromise = null;
  };
  db.onversionchange = () => {
    db.close();
    clearIfCurrent();
  };
  db.onclose = () => {
    clearIfCurrent();
  };
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  const box: { promise?: Promise<IDBDatabase> } = {};

  box.promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    // Rejecting on `blocked` does not cancel the open request: when the other
    // tab eventually closes, the upgrade goes ahead and `onsuccess` fires
    // against a promise that has already settled. Nothing would reference
    // that connection and nothing would close it, so every retry would strand
    // another one. Track whether the promise is spoken for, and close the
    // late arrival. (Mirrors `database.web`.)
    let settled = false;
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      const opened = request.result;
      attachLifecycleHandlers(opened, box);
      resolve(opened);
    };
    request.onerror = () => {
      settled = true;
      reject(request.error);
    };
    // This store is still at version 1, so a blocked upgrade is latent rather
    // than reachable today — it becomes real the first time its schema
    // changes. Without the handler that first bump would leave callers
    // waiting on a promise that never settles.
    request.onblocked = () => {
      settled = true;
      reject(
        new Error(
          'Refrain is open in another tab using an older version of its audio store. Close the other tab and reload.',
        ),
      );
    };
  });
  dbPromise = box.promise;

  // A failed open must not be cached. This one is reachable today: in private
  // browsing, or where storage permission is denied, caching the rejection
  // would fail every audio load for the rest of the page session with no way
  // to retry.
  return dbPromise.catch((error: unknown) => {
    if (dbPromise === box.promise) dbPromise = null;
    throw error;
  });
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

// In-flight creations, keyed by track id. Reading the blob out of IndexedDB is
// asynchronous, so two overlapping calls for the same id both miss the cache,
// both call `createObjectURL`, and the second overwrites the first in the map
// — leaking a URL that nothing will ever revoke, pinning a whole audio blob in
// memory for the page session. Overlapping reads are routine: every library
// load resolves a URL per track, and navigating to the player and straight
// back starts a second load while the first is still running. Callers share
// one in-flight promise per id instead.
const pendingUrls = new Map<string, Promise<string | null>>();

// Bumped whenever a cached URL is invalidated (track deleted, or its blob
// re-put). A creation already in flight compares the token it started with
// against the current one, so it cannot install a URL for a track that was
// deleted or replaced while it was reading.
const revokeTokens = new Map<string, number>();

function tokenFor(id: string): number {
  return revokeTokens.get(id) ?? 0;
}

/**
 * Return a `blob:` object URL for a track id, creating and caching it on
 * first use. Returns null if no blob is stored for the id. Cached so the same
 * URL is reused across library reloads within a page session, and de-duplicated
 * so concurrent callers share one URL rather than leaking one per call.
 */
export function getObjectUrl(id: string): Promise<string | null> {
  const cached = objectUrls.get(id);
  if (cached) return Promise.resolve(cached);

  const inFlight = pendingUrls.get(id);
  if (inFlight) return inFlight;

  const token = tokenFor(id);
  // The promise is held in a box so the `finally` below can identify itself
  // without a self-referential `const`. Clearing the slot there — before this
  // promise settles — means a caller that awaits it can never then observe a
  // stale in-flight entry, and a failed read cannot wedge the id on a rejected
  // promise for the rest of the session.
  const box: { promise?: Promise<string | null> } = {};
  box.promise = (async () => {
    try {
      const blob = await getBlob(id);
      if (!blob) return null;

      const url = URL.createObjectURL(blob);
      if (tokenFor(id) !== token) {
        // Revoked mid-read: this URL refers to a blob the caller no longer
        // wants. Release it rather than caching a URL nothing will revoke.
        URL.revokeObjectURL(url);
        return null;
      }
      objectUrls.set(id, url);
      return url;
    } finally {
      if (pendingUrls.get(id) === box.promise) pendingUrls.delete(id);
    }
  })();

  pendingUrls.set(id, box.promise);
  return box.promise;
}

/** Revoke and forget the cached object URL for a track id, if any. */
export function revokeObjectUrl(id: string): void {
  revokeTokens.set(id, tokenFor(id) + 1);
  // Drop any in-flight read too: its result is now stale, so the next caller
  // should start a fresh read rather than join a doomed one.
  pendingUrls.delete(id);
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
}

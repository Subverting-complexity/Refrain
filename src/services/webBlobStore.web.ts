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

import { createIdbConnection } from './idb.web';

const DB_NAME = 'refrain-audio';
const DB_VERSION = 1;
const STORE = 'blobs';

// Open/lifecycle/transaction plumbing is shared with `database.web` — the
// guarantees (blocked-upgrade rejection, force-close recovery,
// commit-anchored settling) are documented once in `idb.web`. This store is
// still at version 1, so a blocked upgrade is latent rather than reachable
// today — it becomes real the first time its schema changes.
const connection = createIdbConnection({
  name: DB_NAME,
  version: DB_VERSION,
  blockedMessage:
    'Refrain is open in another tab using an older version of its audio store. Close the other tab and reload.',
  upgrade: (db) => {
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE);
    }
  },
});

function runTransaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return connection.runTransaction(STORE, mode, run);
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

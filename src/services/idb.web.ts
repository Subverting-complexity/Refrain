/**
 * Shared IndexedDB connection plumbing for the web services. Both web stores
 * (`database.web` for metadata, `webBlobStore.web` for audio bytes) need the
 * same hard-won open/lifecycle/transaction behavior; this module holds it
 * once so the two cannot drift apart.
 *
 * What a connection guarantees:
 *
 * - **Open results are cached per connection, failures are not.** A failed
 *   open (private browsing, denied storage permission, a transient error)
 *   must not be cached, or every later call would reject for the rest of the
 *   page session with no way to retry.
 * - **`blocked` rejects instead of hanging.** An upgrade held up by another
 *   tab still holding the old version fires neither success nor error, and
 *   the caller would wait forever. Rejecting does not cancel the open
 *   request, though: when the other tab eventually closes, the upgrade goes
 *   ahead and `onsuccess` fires against a promise that has already settled.
 *   Nothing would reference that connection and nothing would close it, so
 *   the late arrival is closed explicitly.
 * - **`versionchange` closes this connection.** A tab that holds the old
 *   version open is exactly what makes the other tab's upgrade block — the
 *   condition the previous point defends against — so close here and let the
 *   other tab proceed.
 * - **`close` drops the cache.** The browser can force-close a connection
 *   out from under us (storage cleared, eviction under memory pressure); the
 *   cached promise would then hold a dead handle and every later transaction
 *   would throw `InvalidStateError` for the rest of the session. Dropping the
 *   cache lets the next call reopen. Both lifecycle handlers clear the cache
 *   only while it still refers to their own connection, so a handler firing
 *   late can never discard a newer one.
 * - **Transactions settle on commit, not on request success.** A request can
 *   report success before the transaction commits, so resolving on
 *   `request.onsuccess` would surface success even when the commit later
 *   fails — a quota-exceeded abort at commit time is the likeliest failure
 *   for the large audio blobs, and it would leave a track's metadata written
 *   but its audio missing. The result is captured on success but the promise
 *   settles only on the transaction's own lifecycle events.
 */

export interface IdbConnectionOptions {
  name: string;
  version: number;
  /**
   * Runs inside the version-change transaction. `oldVersion` is 0 on first
   * creation. `transaction` is the version-change transaction itself (null
   * only if the environment violates the IndexedDB specification).
   */
  upgrade: (
    db: IDBDatabase,
    transaction: IDBTransaction | null,
    oldVersion: number,
  ) => void;
  /** User-facing message when another tab blocks this database's upgrade. */
  blockedMessage: string;
}

export interface IdbConnection {
  openDb(): Promise<IDBDatabase>;
  /**
   * Runs a single request in its own transaction and resolves with its
   * result once the transaction commits.
   */
  runTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T>;
  /**
   * Runs several requests in one transaction, so a batch of writes lands
   * whole or not at all. `run` may issue any number of requests (including
   * follow-up requests from inside `onsuccess` handlers); the promise
   * settles on the transaction's completion.
   */
  runBatchTransaction(
    storeName: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => void,
  ): Promise<void>;
}

export function createIdbConnection(
  options: IdbConnectionOptions,
): IdbConnection {
  let dbPromise: Promise<IDBDatabase> | null = null;

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

    // The promise is held in a box so the lifecycle handlers can compare the
    // cache against their own connection without a self-referential `const`.
    // They only ever run after this assignment completes.
    const box: { promise?: Promise<IDBDatabase> } = {};

    box.promise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(options.name, options.version);
      request.onupgradeneeded = (event) => {
        options.upgrade(
          request.result,
          request.transaction,
          (event as IDBVersionChangeEvent).oldVersion,
        );
      };
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
      request.onblocked = () => {
        settled = true;
        reject(new Error(options.blockedMessage));
      };
    });
    dbPromise = box.promise;

    return dbPromise.catch((error: unknown) => {
      if (dbPromise === box.promise) dbPromise = null;
      throw error;
    });
  }

  function runTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return openDb().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          const request = run(tx.objectStore(storeName));
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

  function runBatchTransaction(
    storeName: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => void,
  ): Promise<void> {
    return openDb().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          run(tx.objectStore(storeName));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () =>
            reject(tx.error ?? new Error('IndexedDB transaction aborted'));
        }),
    );
  }

  return { openDb, runTransaction, runBatchTransaction };
}

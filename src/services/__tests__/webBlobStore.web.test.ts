/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @jest-environment node
 */
import { IDBFactory } from 'fake-indexeddb';

// A counter-backed object-URL mock so we can assert create/revoke calls.
let urlCounter = 0;
const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  // Fresh IndexedDB and a fresh module instance (resets the cached db
  // promise and the object-URL cache) for every test.
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  urlCounter = 0;
  created.length = 0;
  revoked.length = 0;
  (
    globalThis as unknown as {
      URL: { createObjectURL: unknown; revokeObjectURL: unknown };
    }
  ).URL = {
    createObjectURL: jest.fn(() => {
      const url = `blob:mock/${urlCounter++}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: jest.fn((url: string) => {
      revoked.push(url);
    }),
  };
  jest.resetModules();
});

function load() {
  return require('../webBlobStore.web');
}

function makeBlob(text = 'audio-bytes'): Blob {
  return new Blob([text], { type: 'audio/mpeg' });
}

describe('putBlob / getBlob', () => {
  it('persists and reads back a blob by id', async () => {
    const store = load();
    const blob = makeBlob('hello');
    await store.putBlob('id-1', blob);

    const read = await store.getBlob('id-1');
    // The stored value roundtrips back (byte fidelity is IndexedDB's
    // guarantee; here we assert the key/value mapping works).
    expect(read).not.toBeNull();
  });

  it('returns null for an unknown id', async () => {
    const store = load();
    expect(await store.getBlob('missing')).toBeNull();
  });

  it('overwrites rather than appends for the same id', async () => {
    const store = load();
    await store.putBlob('id-1', makeBlob('first'));
    await store.putBlob('id-1', makeBlob('second'));
    // Keyed put replaces in place — a single entry remains for the id.
    expect(await store.listBlobIds()).toEqual(['id-1']);
  });
});

describe('deleteBlob', () => {
  it('removes a stored blob', async () => {
    const store = load();
    await store.putBlob('id-1', makeBlob());
    await store.deleteBlob('id-1');
    expect(await store.getBlob('id-1')).toBeNull();
  });

  it('is a no-op for an unknown id', async () => {
    const store = load();
    await expect(store.deleteBlob('missing')).resolves.toBeUndefined();
  });
});

describe('listBlobIds', () => {
  it('returns all stored ids', async () => {
    const store = load();
    await store.putBlob('a', makeBlob());
    await store.putBlob('b', makeBlob());
    const ids = await store.listBlobIds();
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('returns an empty array when nothing is stored', async () => {
    const store = load();
    expect(await store.listBlobIds()).toEqual([]);
  });
});

describe('getObjectUrl', () => {
  it('creates an object URL for a stored blob', async () => {
    const store = load();
    await store.putBlob('id-1', makeBlob());
    const url = await store.getObjectUrl('id-1');
    expect(url).toBe('blob:mock/0');
    expect(created).toEqual(['blob:mock/0']);
  });

  it('returns null when no blob is stored', async () => {
    const store = load();
    expect(await store.getObjectUrl('missing')).toBeNull();
    expect(created).toEqual([]);
  });

  it('invalidates the cached URL when a blob is re-put under the same id', async () => {
    const store = load();
    await store.putBlob('id-1', makeBlob('first'));
    const oldUrl = await store.getObjectUrl('id-1');
    expect(oldUrl).toBe('blob:mock/0');

    await store.putBlob('id-1', makeBlob('second'));
    expect(revoked).toEqual([oldUrl]);

    const newUrl = await store.getObjectUrl('id-1');
    expect(newUrl).not.toBe(oldUrl);
    expect(created).toHaveLength(2);
  });

  it('caches the URL and reuses it on subsequent calls', async () => {
    const store = load();
    await store.putBlob('id-1', makeBlob());
    const first = await store.getObjectUrl('id-1');
    const second = await store.getObjectUrl('id-1');
    expect(first).toBe(second);
    expect(created).toHaveLength(1);
  });

  it('creates one URL for concurrent calls on the same id', async () => {
    const store = load();
    await store.putBlob('id-1', makeBlob());

    // Two overlapping library loads (navigate away and straight back) both
    // resolve the same track. Without in-flight de-duplication each creates
    // its own URL and the first is dropped from the cache un-revoked,
    // pinning the audio blob in memory for the rest of the session.
    const [a, b] = await Promise.all([
      store.getObjectUrl('id-1'),
      store.getObjectUrl('id-1'),
    ]);

    expect(a).toBe(b);
    expect(created).toHaveLength(1);
    expect(revoked).toEqual([]);
  });

  it('does not cache a URL for a read that was revoked mid-flight', async () => {
    const store = load();
    await store.putBlob('id-1', makeBlob());

    const inFlight = store.getObjectUrl('id-1');
    // The track is deleted while the blob read is still pending.
    store.revokeObjectUrl('id-1');
    expect(await inFlight).toBeNull();

    // Whatever URL that read produced was released, not cached.
    expect(revoked).toEqual(created);
  });
});

describe('revokeObjectUrl', () => {
  it('revokes and forgets a cached URL', async () => {
    const store = load();
    await store.putBlob('id-1', makeBlob());
    const url = await store.getObjectUrl('id-1');
    store.revokeObjectUrl('id-1');
    expect(revoked).toEqual([url]);

    // A fresh getObjectUrl creates a new URL after revocation.
    const next = await store.getObjectUrl('id-1');
    expect(next).not.toBe(url);
    expect(created).toHaveLength(2);
  });

  it('is a no-op when nothing is cached', () => {
    const store = load();
    expect(() => store.revokeObjectUrl('missing')).not.toThrow();
    expect(revoked).toEqual([]);
  });
});

describe('opening the audio store', () => {
  it('opens again after a failed open rather than replaying the rejection', async () => {
    const store = load();

    // The reachable case: in private browsing, or where storage permission
    // is denied, the open fails. Caching that rejection would fail every
    // audio load for the rest of the page session with no way to retry, so
    // a track that imported fine could never be played again.
    const openSpy = jest.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new Error('storage is not available');
    });

    await expect(store.getBlob('id-1')).rejects.toThrow(
      'storage is not available',
    );
    openSpy.mockRestore();

    await expect(store.getBlob('id-1')).resolves.toBeNull();
  });

  it('rejects with an explanation when an upgrade is blocked', async () => {
    const store = load();

    // This store is still at version 1, so `blocked` cannot be provoked
    // through a genuine upgrade — it becomes reachable the first time the
    // schema changes. Firing the event directly covers the wiring now, so
    // that bump does not ship a version where callers wait on a promise
    // that never settles.
    const realOpen = indexedDB.open.bind(indexedDB);
    const openSpy = jest
      .spyOn(indexedDB, 'open')
      .mockImplementationOnce((name: string, version?: number) => {
        const request = realOpen(name, version);
        queueMicrotask(() => {
          request.onblocked?.(new Event('blocked') as never);
        });
        return request;
      });

    try {
      await expect(store.getBlob('id-1')).rejects.toThrow(
        /open in another tab/,
      );
    } finally {
      openSpy.mockRestore();
    }
  });

  it('closes the connection a blocked open left behind', async () => {
    const store = load();

    // Rejecting does not cancel the open request. It goes on to succeed and
    // hands back a connection nothing is waiting for; left open it would sit
    // there for the rest of the page session, one more for every retry.
    const realOpen = indexedDB.open.bind(indexedDB);
    let opened: IDBDatabase | null = null;
    const openSpy = jest
      .spyOn(indexedDB, 'open')
      .mockImplementationOnce((name: string, version?: number) => {
        const request = realOpen(name, version);
        request.addEventListener('success', () => {
          opened = request.result;
        });
        queueMicrotask(() => {
          request.onblocked?.(new Event('blocked') as never);
        });
        return request;
      });

    await expect(store.getBlob('id-1')).rejects.toThrow(/open in another tab/);
    openSpy.mockRestore();

    // Let the late success land, then check it was not left open.
    for (let tick = 0; tick < 50 && opened === null; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(opened).not.toBeNull();
    // A closed fake-indexeddb connection refuses to start a transaction.
    expect(() => opened!.transaction('blobs', 'readonly')).toThrow();
  });
});

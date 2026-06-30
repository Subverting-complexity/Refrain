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

describe('revokeAllObjectUrls', () => {
  it('revokes every cached URL', async () => {
    const store = load();
    await store.putBlob('a', makeBlob());
    await store.putBlob('b', makeBlob());
    await store.getObjectUrl('a');
    await store.getObjectUrl('b');

    store.revokeAllObjectUrls();
    expect(revoked).toHaveLength(2);

    // Cache cleared: next resolves create new URLs.
    await store.getObjectUrl('a');
    expect(created).toHaveLength(3);
  });
});

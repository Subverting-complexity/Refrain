/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @jest-environment node
 *
 * Web per-track marker persistence. Exercised against `fake-indexeddb` through
 * the real `database.web` object-store logic so the IndexedDB round-trip (not a
 * mock) is covered.
 */
import { IDBFactory } from 'fake-indexeddb';

type MarkerStoreModule = typeof import('../markerStore.web');

beforeEach(() => {
  // Fresh IndexedDB and a fresh module instance (resets the cached db promise)
  // for every test.
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  jest.resetModules();
});

function load(): MarkerStoreModule {
  return require('../markerStore.web');
}

describe('markerStore.web', () => {
  it('round-trips an active marker set for a track', async () => {
    const store = load();
    await store.setActiveMarkers('track-1', {
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
    });
    expect(await store.getActiveMarkers('track-1')).toEqual({
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
    });
  });

  it('round-trips null markers and a disabled loop', async () => {
    const store = load();
    await store.setActiveMarkers('track-1', {
      markerA: null,
      markerB: null,
      loopEnabled: false,
    });
    expect(await store.getActiveMarkers('track-1')).toEqual({
      markerA: null,
      markerB: null,
      loopEnabled: false,
    });
  });

  it('returns null for a track with no saved markers', async () => {
    const store = load();
    expect(await store.getActiveMarkers('missing')).toBeNull();
  });

  it('overwrites an existing marker set on the same track id', async () => {
    const store = load();
    await store.setActiveMarkers('track-1', {
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
    });
    await store.setActiveMarkers('track-1', {
      markerA: 2000,
      markerB: 6000,
      loopEnabled: false,
    });
    expect(await store.getActiveMarkers('track-1')).toEqual({
      markerA: 2000,
      markerB: 6000,
      loopEnabled: false,
    });
  });

  it('deletes a marker set', async () => {
    const store = load();
    await store.setActiveMarkers('track-1', {
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
    });
    await store.deleteMarkers('track-1');
    expect(await store.getActiveMarkers('track-1')).toBeNull();
  });

  it('keeps marker sets isolated per track', async () => {
    const store = load();
    await store.setActiveMarkers('track-1', {
      markerA: 1,
      markerB: 2,
      loopEnabled: true,
    });
    await store.setActiveMarkers('track-2', {
      markerA: 3,
      markerB: 4,
      loopEnabled: false,
    });
    expect(await store.getActiveMarkers('track-1')).toEqual({
      markerA: 1,
      markerB: 2,
      loopEnabled: true,
    });
    expect(await store.getActiveMarkers('track-2')).toEqual({
      markerA: 3,
      markerB: 4,
      loopEnabled: false,
    });
  });
});

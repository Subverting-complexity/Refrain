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

// Deterministic ids so profile assertions don't depend on a real UUID.
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `profile-${++mockUuidCounter}`,
}));

beforeEach(() => {
  // Fresh IndexedDB and a fresh module instance (resets the cached db promise)
  // for every test.
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  jest.resetModules();
  mockUuidCounter = 0;
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

  describe('segment profiles', () => {
    it('saves a profile and returns it with a generated id and createdAt', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(123_456);
      const store = load();

      const profile = await store.saveProfile('track-1', {
        name: 'Verse',
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
      });

      expect(profile).toEqual({
        id: 'profile-1',
        trackId: 'track-1',
        name: 'Verse',
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
        createdAt: 123_456,
      });
    });

    it('round-trips saved profiles for a track', async () => {
      const store = load();
      const saved = await store.saveProfile('track-1', {
        name: 'Verse',
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
      });

      expect(await store.listProfiles('track-1')).toEqual([saved]);
    });

    it('lists profiles oldest-first by createdAt', async () => {
      const store = load();
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValue(20);
      await store.saveProfile('track-1', {
        name: 'Second',
        markerA: null,
        markerB: null,
        loopEnabled: false,
      });
      now.mockReturnValue(10);
      await store.saveProfile('track-1', {
        name: 'First',
        markerA: null,
        markerB: null,
        loopEnabled: false,
      });

      const names = (await store.listProfiles('track-1')).map((p) => p.name);
      expect(names).toEqual(['First', 'Second']);
    });

    it('scopes profiles to a single track', async () => {
      const store = load();
      await store.saveProfile('track-1', {
        name: 'A',
        markerA: 1,
        markerB: 2,
        loopEnabled: true,
      });
      await store.saveProfile('track-2', {
        name: 'B',
        markerA: 3,
        markerB: 4,
        loopEnabled: false,
      });

      expect((await store.listProfiles('track-1')).map((p) => p.name)).toEqual([
        'A',
      ]);
      expect((await store.listProfiles('track-2')).map((p) => p.name)).toEqual([
        'B',
      ]);
    });

    it('renames a profile', async () => {
      const store = load();
      const saved = await store.saveProfile('track-1', {
        name: 'Old',
        markerA: 1,
        markerB: 2,
        loopEnabled: true,
      });

      await store.renameProfile(saved.id, 'New');

      const [profile] = await store.listProfiles('track-1');
      expect(profile.name).toBe('New');
    });

    it('renaming a missing profile is a no-op', async () => {
      const store = load();
      await expect(
        store.renameProfile('does-not-exist', 'New'),
      ).resolves.toBeUndefined();
      expect(await store.listProfiles('track-1')).toEqual([]);
    });

    it('deletes a single profile', async () => {
      const store = load();
      const a = await store.saveProfile('track-1', {
        name: 'A',
        markerA: 1,
        markerB: 2,
        loopEnabled: true,
      });
      await store.saveProfile('track-1', {
        name: 'B',
        markerA: 3,
        markerB: 4,
        loopEnabled: false,
      });

      await store.deleteProfile(a.id);

      expect((await store.listProfiles('track-1')).map((p) => p.name)).toEqual([
        'B',
      ]);
    });

    it('deletes all profiles for a track but leaves other tracks', async () => {
      const store = load();
      await store.saveProfile('track-1', {
        name: 'A',
        markerA: 1,
        markerB: 2,
        loopEnabled: true,
      });
      await store.saveProfile('track-1', {
        name: 'B',
        markerA: 3,
        markerB: 4,
        loopEnabled: true,
      });
      await store.saveProfile('track-2', {
        name: 'C',
        markerA: 5,
        markerB: 6,
        loopEnabled: false,
      });

      await store.deleteProfilesForTrack('track-1');

      expect(await store.listProfiles('track-1')).toEqual([]);
      expect((await store.listProfiles('track-2')).map((p) => p.name)).toEqual([
        'C',
      ]);
    });
  });
});

import { SegmentProfile } from '../../types';
import { buildProfile, compareProfiles } from '../markerStoreHelpers';

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
}));

describe('markerStoreHelpers', () => {
  describe('buildProfile', () => {
    it('constructs a SegmentProfile with generated id and timestamp', () => {
      jest.spyOn(Date, 'now').mockReturnValue(999);

      const profile = buildProfile('track-1', {
        name: 'Verse',
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
      });

      expect(profile).toEqual({
        id: 'test-uuid',
        trackId: 'track-1',
        name: 'Verse',
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
        createdAt: 999,
      });
    });

    it('preserves null markers and false loopEnabled', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1);

      const profile = buildProfile('track-2', {
        name: 'Silent',
        markerA: null,
        markerB: null,
        loopEnabled: false,
      });

      expect(profile.markerA).toBeNull();
      expect(profile.markerB).toBeNull();
      expect(profile.loopEnabled).toBe(false);
    });
  });

  describe('compareProfiles', () => {
    const base: SegmentProfile = {
      id: 'a',
      trackId: 't',
      name: 'X',
      markerA: null,
      markerB: null,
      loopEnabled: false,
      createdAt: 10,
    };

    it('sorts by createdAt ascending', () => {
      const older = { ...base, createdAt: 5 };
      const newer = { ...base, createdAt: 15 };
      expect(compareProfiles(older, newer)).toBeLessThan(0);
      expect(compareProfiles(newer, older)).toBeGreaterThan(0);
    });

    it('breaks createdAt ties by id ascending', () => {
      const a = { ...base, id: 'alpha', createdAt: 10 };
      const b = { ...base, id: 'beta', createdAt: 10 };
      expect(compareProfiles(a, b)).toBeLessThan(0);
      expect(compareProfiles(b, a)).toBeGreaterThan(0);
    });

    it('returns 0 for identical profiles', () => {
      expect(compareProfiles(base, { ...base })).toBe(0);
    });
  });
});

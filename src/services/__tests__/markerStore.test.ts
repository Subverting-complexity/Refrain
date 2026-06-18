/* eslint-disable @typescript-eslint/no-require-imports */

const mockRunSync = jest.fn();
const mockGetFirstSync = jest.fn();
const mockGetAllSync = jest.fn();
const mockExecSync = jest.fn();
const mockCloseSync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    runSync: mockRunSync,
    getFirstSync: mockGetFirstSync,
    getAllSync: mockGetAllSync,
    execSync: mockExecSync,
    closeSync: mockCloseSync,
  })),
}));

const mockRandomUUID = jest.fn(() => 'profile-uuid');
jest.mock('expo-crypto', () => ({
  randomUUID: () => mockRandomUUID(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  mockRandomUUID.mockReturnValue('profile-uuid');
  mockGetFirstSync.mockReturnValue(undefined);
  // getDatabase() runs the tracks-schema migration, which reads the table's
  // columns via getAllSync. Report the column as present so no ALTER is issued.
  mockGetAllSync.mockReturnValue([{ name: 'durationEstimated' }]);
});

describe('markerStore', () => {
  describe('getActiveMarkers', () => {
    it('returns the stored markers with a boolean loopEnabled', () => {
      mockGetFirstSync.mockReturnValue({
        markerA: 1000,
        markerB: 5000,
        loopEnabled: 1,
      });
      const { getActiveMarkers } = require('../markerStore');

      expect(getActiveMarkers('track-1')).toEqual({
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
      });
      expect(mockGetFirstSync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT markerA, markerB, loopEnabled'),
        'track-1',
      );
    });

    it('converts loopEnabled 0 to false', () => {
      mockGetFirstSync.mockReturnValue({
        markerA: null,
        markerB: null,
        loopEnabled: 0,
      });
      const { getActiveMarkers } = require('../markerStore');

      expect(getActiveMarkers('track-1')).toEqual({
        markerA: null,
        markerB: null,
        loopEnabled: false,
      });
    });

    it('returns null when nothing is saved', () => {
      mockGetFirstSync.mockReturnValue(undefined);
      const { getActiveMarkers } = require('../markerStore');

      expect(getActiveMarkers('missing')).toBeNull();
    });
  });

  describe('setActiveMarkers', () => {
    it('upserts the marker set with loopEnabled as an integer', () => {
      const { setActiveMarkers } = require('../markerStore');

      setActiveMarkers('track-1', {
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
      });

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO track_markers'),
        'track-1',
        1000,
        5000,
        1,
      );
    });

    it('stores loopEnabled false as 0 and null markers as null', () => {
      const { setActiveMarkers } = require('../markerStore');

      setActiveMarkers('track-1', {
        markerA: null,
        markerB: null,
        loopEnabled: false,
      });

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT(trackId) DO UPDATE'),
        'track-1',
        null,
        null,
        0,
      );
    });
  });

  describe('deleteMarkers', () => {
    it('removes the marker row by trackId', () => {
      const { deleteMarkers } = require('../markerStore');

      deleteMarkers('track-1');

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM track_markers'),
        'track-1',
      );
    });
  });

  describe('listProfiles', () => {
    it('maps rows to profiles ordered by createdAt then id', () => {
      // First getAllSync call is the schema migration PRAGMA; the second is
      // the profiles query.
      mockGetAllSync
        .mockReturnValueOnce([{ name: 'durationEstimated' }])
        .mockReturnValueOnce([
          {
            id: 'p1',
            trackId: 'track-1',
            name: 'Verse',
            markerA: 1000,
            markerB: 5000,
            loopEnabled: 1,
            createdAt: 10,
          },
          {
            id: 'p2',
            trackId: 'track-1',
            name: 'Chorus',
            markerA: null,
            markerB: null,
            loopEnabled: 0,
            createdAt: 20,
          },
        ]);
      const { listProfiles } = require('../markerStore');

      expect(listProfiles('track-1')).toEqual([
        {
          id: 'p1',
          trackId: 'track-1',
          name: 'Verse',
          markerA: 1000,
          markerB: 5000,
          loopEnabled: true,
          createdAt: 10,
        },
        {
          id: 'p2',
          trackId: 'track-1',
          name: 'Chorus',
          markerA: null,
          markerB: null,
          loopEnabled: false,
          createdAt: 20,
        },
      ]);
      expect(mockGetAllSync).toHaveBeenLastCalledWith(
        expect.stringContaining('FROM marker_profiles'),
        'track-1',
      );
    });

    it('returns an empty list when a track has no profiles', () => {
      mockGetAllSync
        .mockReturnValueOnce([{ name: 'durationEstimated' }])
        .mockReturnValueOnce([]);
      const { listProfiles } = require('../markerStore');

      expect(listProfiles('track-1')).toEqual([]);
    });
  });

  describe('saveProfile', () => {
    it('inserts a generated id + createdAt and returns the profile', () => {
      jest.spyOn(Date, 'now').mockReturnValue(123_456);
      const { saveProfile } = require('../markerStore');

      const profile = saveProfile('track-1', {
        name: 'Verse',
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
      });

      expect(profile).toEqual({
        id: 'profile-uuid',
        trackId: 'track-1',
        name: 'Verse',
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
        createdAt: 123_456,
      });
      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO marker_profiles'),
        'profile-uuid',
        'track-1',
        'Verse',
        1000,
        5000,
        1,
        123_456,
      );
    });

    it('stores loopEnabled false as 0 and null markers as null', () => {
      jest.spyOn(Date, 'now').mockReturnValue(7);
      const { saveProfile } = require('../markerStore');

      saveProfile('track-1', {
        name: 'Whole',
        markerA: null,
        markerB: null,
        loopEnabled: false,
      });

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO marker_profiles'),
        'profile-uuid',
        'track-1',
        'Whole',
        null,
        null,
        0,
        7,
      );
    });
  });

  describe('renameProfile', () => {
    it('updates the name by profile id', () => {
      const { renameProfile } = require('../markerStore');

      renameProfile('p1', 'New name');

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE marker_profiles SET name'),
        'New name',
        'p1',
      );
    });
  });

  describe('deleteProfile', () => {
    it('removes a single profile by id', () => {
      const { deleteProfile } = require('../markerStore');

      deleteProfile('p1');

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM marker_profiles WHERE id'),
        'p1',
      );
    });
  });

  describe('deleteProfilesForTrack', () => {
    it('removes all profiles for a track', () => {
      const { deleteProfilesForTrack } = require('../markerStore');

      deleteProfilesForTrack('track-1');

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM marker_profiles WHERE trackId'),
        'track-1',
      );
    });
  });
});

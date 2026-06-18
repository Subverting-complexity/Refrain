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

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
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
});

import { loadTracks, cleanupOrphanFiles } from '../trackStore';

// Reproduce expo-file-system's web behaviour: constructing File/Directory
// throws because the native-only `validatePath` method is missing. The web
// guards in trackStore must short-circuit before any construction.
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => {
    throw new TypeError('this.validatePath is not a function');
  }),
  Directory: jest.fn(() => {
    throw new TypeError('this.validatePath is not a function');
  }),
  Paths: { document: 'file:///data' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const mockGetAllSync = jest.fn(() => [] as unknown[]);
jest.mock('../database', () => ({
  getDatabase: jest.fn(() => ({
    getAllSync: mockGetAllSync,
    getFirstSync: jest.fn(),
    runSync: jest.fn(),
  })),
}));

const { File, Directory } = jest.requireMock('expo-file-system') as {
  File: jest.Mock;
  Directory: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllSync.mockReturnValue([]);
});

describe('trackStore on web', () => {
  it('loadTracks resolves without constructing File/Directory', async () => {
    await expect(loadTracks()).resolves.toEqual([]);
    expect(File).not.toHaveBeenCalled();
    expect(Directory).not.toHaveBeenCalled();
  });

  it('cleanupOrphanFiles returns 0 without constructing a Directory', () => {
    expect(cleanupOrphanFiles()).toBe(0);
    expect(Directory).not.toHaveBeenCalled();
  });

  it('the expo-file-system mock would throw if constructed (guards are doing the work)', () => {
    expect(() => new Directory('file:///data', 'tracks')).toThrow(
      'validatePath',
    );
  });
});

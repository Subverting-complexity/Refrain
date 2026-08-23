import { newFolder } from '../folderStoreHelpers';

jest.mock('../../utils/generateId', () => ({
  generateId: jest.fn(() => 'generated-id'),
}));

describe('newFolder', () => {
  it('gives the folder an id and the name it was asked for', () => {
    const folder = newFolder('Scales', 1_000);
    expect(folder.id).toBe('generated-id');
    expect(folder.name).toBe('Scales');
  });

  it('starts unpinned', () => {
    expect(newFolder('Scales', 1_000).pinOrder).toBeNull();
  });

  // The reason this is a function rather than a literal at each call site.
  // `insertFolder` writes `lastOpenedAt ?? createdAt`, so a caller holding
  // null would hold a value the row does not have, and `loadFolders` would
  // sort the folder to the never-opened tail until the next reload moved it.
  it('seeds lastOpenedAt from createdAt so a new folder is not treated as never opened', () => {
    const folder = newFolder('Scales', 1_234);
    expect(folder.createdAt).toBe(1_234);
    expect(folder.lastOpenedAt).toBe(1_234);
  });

  it('reads the clock once, so both stamps always agree', () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValueOnce(5_000).mockReturnValueOnce(9_999);

    const folder = newFolder('Scales');

    expect(folder.createdAt).toBe(5_000);
    expect(folder.lastOpenedAt).toBe(5_000);
    now.mockRestore();
  });
});

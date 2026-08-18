import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SegmentProfile, SegmentProfileInput } from '../../types';
import { useSegmentProfiles, UseSegmentProfiles } from '../useSegmentProfiles';

const mockListProfiles = jest.fn<SegmentProfile[], [string]>();
const mockSaveProfile = jest.fn<
  SegmentProfile,
  [string, SegmentProfileInput]
>();
const mockUpdateProfile = jest.fn<void, [string, unknown]>();
const mockRenameProfile = jest.fn<void, [string, string]>();
const mockDeleteProfile = jest.fn<void, [string]>();

jest.mock('../../services/markerStore', () => ({
  listProfiles: (trackId: string) => mockListProfiles(trackId),
  saveProfile: (trackId: string, input: SegmentProfileInput) =>
    mockSaveProfile(trackId, input),
  updateProfile: (profileId: string, region: unknown) =>
    mockUpdateProfile(profileId, region),
  renameProfile: (profileId: string, name: string) =>
    mockRenameProfile(profileId, name),
  deleteProfile: (profileId: string) => mockDeleteProfile(profileId),
}));

function profile(id: string, name: string): SegmentProfile {
  return {
    id,
    trackId: 't1',
    name,
    markerA: 1000,
    markerB: 5000,
    loopEnabled: true,
    createdAt: 1,
  };
}

let lastResult: UseSegmentProfiles;

function TestComponent({ trackId }: { trackId: string | null }) {
  lastResult = useSegmentProfiles(trackId);
  return null;
}

async function renderHook(trackId: string | null = 't1') {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(TestComponent, { trackId }));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListProfiles.mockReturnValue([profile('p1', 'Segment 1')]);
});

describe('useSegmentProfiles', () => {
  it('loads the track profiles on mount', async () => {
    await renderHook();
    expect(mockListProfiles).toHaveBeenCalledWith('t1');
    expect(lastResult.profiles).toEqual([profile('p1', 'Segment 1')]);
  });

  it('returns an empty list and skips the store when there is no track', async () => {
    await renderHook(null);
    expect(mockListProfiles).not.toHaveBeenCalled();
    expect(lastResult.profiles).toEqual([]);
  });

  it('saves a new profile, refreshes, and returns the stored record', async () => {
    await renderHook();
    const input: SegmentProfileInput = {
      name: 'Chorus',
      markerA: 2000,
      markerB: 4000,
      loopEnabled: false,
    };
    const saved = profile('p2', 'Chorus');
    mockSaveProfile.mockReturnValue(saved);
    mockListProfiles.mockReturnValue([profile('p1', 'Segment 1'), saved]);

    let returned: SegmentProfile | null = null;
    await act(async () => {
      returned = await lastResult.save(input);
    });

    expect(mockSaveProfile).toHaveBeenCalledWith('t1', input);
    expect(returned).toEqual(saved);
    expect(lastResult.profiles).toHaveLength(2);
  });

  it('returns null from save when there is no track', async () => {
    await renderHook(null);

    let returned: SegmentProfile | null = profile('x', 'x');
    await act(async () => {
      returned = await lastResult.save({
        name: 'Nope',
        markerA: 1,
        markerB: 2,
        loopEnabled: true,
      });
    });

    expect(mockSaveProfile).not.toHaveBeenCalled();
    expect(returned).toBeNull();
  });

  it('updates a profile region then refreshes', async () => {
    await renderHook();
    const region = { markerA: 3000, markerB: 9000, loopEnabled: false };
    mockListProfiles.mockReturnValue([profile('p1', 'Segment 1')]);

    await act(async () => {
      lastResult.update('p1', region);
    });

    expect(mockUpdateProfile).toHaveBeenCalledWith('p1', region);
  });

  it('renames a profile then refreshes', async () => {
    await renderHook();
    mockListProfiles.mockReturnValue([profile('p1', 'Verse')]);

    await act(async () => {
      lastResult.rename('p1', 'Verse');
    });

    expect(mockRenameProfile).toHaveBeenCalledWith('p1', 'Verse');
    expect(lastResult.profiles[0].name).toBe('Verse');
  });

  it('removes a profile then refreshes', async () => {
    await renderHook();
    mockListProfiles.mockReturnValue([]);

    await act(async () => {
      lastResult.remove('p1');
    });

    expect(mockDeleteProfile).toHaveBeenCalledWith('p1');
    expect(lastResult.profiles).toEqual([]);
  });

  // On web `listProfiles` is async, so a slow read for one track can resolve
  // after a later one. Without a sequence guard the stale response wins and
  // the user sees the previous track's segments.
  it('ignores a stale read that resolves after a newer one', async () => {
    const slow = [profile('old', 'Old track segment')];
    const fresh = [profile('new', 'New track segment')];

    let releaseSlow!: () => void;
    mockListProfiles.mockImplementation(
      (trackId: string) =>
        (trackId === 't1'
          ? new Promise((resolve) => {
              releaseSlow = () => resolve(slow);
            })
          : Promise.resolve(fresh)) as unknown as SegmentProfile[],
    );

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(createElement(TestComponent, { trackId: 't1' }));
    });

    // Switch tracks; the second read resolves first.
    await act(async () => {
      tree.update(createElement(TestComponent, { trackId: 't2' }));
    });
    expect(lastResult.profiles).toEqual(fresh);

    // Now let the first track's read land late.
    await act(async () => {
      releaseSlow();
    });

    expect(lastResult.profiles).toEqual(fresh);
  });

  it('ignores a stale read when two refreshes overlap', async () => {
    const first = [profile('p1', 'First')];
    const second = [profile('p2', 'Second')];

    await renderHook();

    let releaseFirst!: () => void;
    mockListProfiles
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => resolve(first);
          }) as unknown as SegmentProfile[],
      )
      .mockImplementation(
        () => Promise.resolve(second) as unknown as SegmentProfile[],
      );

    await act(async () => {
      lastResult.refresh();
      lastResult.refresh();
    });

    expect(lastResult.profiles).toEqual(second);

    await act(async () => {
      releaseFirst();
    });

    expect(lastResult.profiles).toEqual(second);
  });

  it('keeps the last good list when a read throws', async () => {
    await renderHook();
    mockListProfiles.mockImplementation(() => {
      throw new Error('db down');
    });

    await act(async () => {
      lastResult.refresh();
    });

    // A failed refresh falls back to an empty list rather than throwing.
    expect(lastResult.profiles).toEqual([]);
  });
});

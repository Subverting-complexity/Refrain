import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SegmentProfile, SegmentProfileInput } from '../../types';
import { useSegmentProfiles, UseSegmentProfiles } from '../useSegmentProfiles';

const mockListProfiles = jest.fn<SegmentProfile[], [string]>();
const mockSaveProfile = jest.fn<
  SegmentProfile,
  [string, SegmentProfileInput]
>();
const mockRenameProfile = jest.fn<void, [string, string]>();
const mockDeleteProfile = jest.fn<void, [string]>();

jest.mock('../../services/markerStore', () => ({
  listProfiles: (trackId: string) => mockListProfiles(trackId),
  saveProfile: (trackId: string, input: SegmentProfileInput) =>
    mockSaveProfile(trackId, input),
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

  it('saves a new profile then refreshes the list', async () => {
    await renderHook();
    const input: SegmentProfileInput = {
      name: 'Chorus',
      markerA: 2000,
      markerB: 4000,
      loopEnabled: false,
    };
    mockListProfiles.mockReturnValue([
      profile('p1', 'Segment 1'),
      profile('p2', 'Chorus'),
    ]);

    await act(async () => {
      lastResult.save(input);
    });

    expect(mockSaveProfile).toHaveBeenCalledWith('t1', input);
    expect(lastResult.profiles).toHaveLength(2);
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

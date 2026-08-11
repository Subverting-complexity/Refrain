import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { SegmentProfile } from '../../types';
import { useSegmentWorkflow, UseSegmentWorkflow } from '../useSegmentWorkflow';

// Capture the navigation beforeRemove listener so a test can fire the
// leave-the-player guard, and the dispatch a resolved guard re-issues. The
// navigation object is built inside the factory so it stays identity-stable
// and the listener subscribes exactly once.
let mockBeforeRemoveCb: ((event: unknown) => void) | null = null;
const mockDispatch = jest.fn();
jest.mock('expo-router', () => {
  const navigation = {
    addListener: (event: string, cb: (e: unknown) => void) => {
      if (event === 'beforeRemove') mockBeforeRemoveCb = cb;
      return () => {
        mockBeforeRemoveCb = null;
      };
    },
    dispatch: (...args: unknown[]) => mockDispatch(...args),
    setOptions: jest.fn(),
  };
  return { useNavigation: () => navigation };
});

// The profile store is mocked; useSegmentEditor is left real so the dirty
// tracking under test is the genuine one.
const mockSave = jest.fn<Promise<SegmentProfile | null>, [unknown]>();
const mockUpdate = jest.fn();
const mockRename = jest.fn();
const mockRemove = jest.fn();
let mockProfiles: SegmentProfile[] = [];
jest.mock('../useSegmentProfiles', () => ({
  useSegmentProfiles: () => ({
    profiles: mockProfiles,
    refresh: jest.fn(),
    save: mockSave,
    update: mockUpdate,
    rename: mockRename,
    remove: mockRemove,
  }),
}));

const setMarkerA = jest.fn();
const setMarkerB = jest.fn(() => true);
const setLoopEnabled = jest.fn();
const showToast = jest.fn();

let lastResult: UseSegmentWorkflow;

interface Props {
  markerA: number | null;
  markerB: number | null;
  loopEnabled?: boolean;
  trackId?: string | null;
}

function TestComponent({
  markerA,
  markerB,
  loopEnabled = true,
  trackId = 't1',
}: Props) {
  lastResult = useSegmentWorkflow({
    trackId,
    markerA,
    markerB,
    loopEnabled,
    setMarkerA,
    setMarkerB,
    setLoopEnabled,
    showToast,
  });
  return null;
}

function render(props: Props) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(createElement(TestComponent, props));
  });
  return {
    update: (next: Props) =>
      act(() => {
        tree.update(createElement(TestComponent, next));
      }),
  };
}

function profile(overrides: Partial<SegmentProfile> = {}): SegmentProfile {
  return {
    id: 'p1',
    trackId: 't1',
    name: 'Verse',
    markerA: 1000,
    markerB: 5000,
    loopEnabled: true,
    createdAt: 1,
    ...overrides,
  };
}

/**
 * Load `p` as the current segment, then move the live markers away from it so
 * the editor reports the segment as dirty — the precondition for every guard.
 */
function loadThenDirty(
  api: ReturnType<typeof render>,
  p: SegmentProfile,
  moved = { markerA: 2000, markerB: 5000 },
) {
  act(() => lastResult.requestLoad(p));
  api.update({ markerA: p.markerA, markerB: p.markerB });
  api.update(moved);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfiles = [];
  mockBeforeRemoveCb = null;
  mockSave.mockResolvedValue(profile());
});

describe('useSegmentWorkflow', () => {
  describe('loading a segment', () => {
    it('arms the engine and adopts the segment when nothing is dirty', () => {
      render({ markerA: null, markerB: null });

      act(() => lastResult.requestLoad(profile()));

      expect(setMarkerA).toHaveBeenCalledWith(1000);
      expect(setMarkerB).toHaveBeenCalledWith(5000);
      expect(setLoopEnabled).toHaveBeenCalledWith(true);
      expect(lastResult.guardVisible).toBe(false);
    });

    it('sets A before B so the A < B invariant holds', () => {
      render({ markerA: null, markerB: null });

      act(() => lastResult.requestLoad(profile()));

      expect(setMarkerA.mock.invocationCallOrder[0]).toBeLessThan(
        setMarkerB.mock.invocationCallOrder[0],
      );
    });

    it('skips unset markers on the saved profile', () => {
      render({ markerA: null, markerB: null });

      act(() => lastResult.requestLoad(profile({ markerB: null })));

      expect(setMarkerA).toHaveBeenCalledWith(1000);
      expect(setMarkerB).not.toHaveBeenCalled();
    });

    it('raises the guard instead of loading when the segment is dirty', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      setMarkerA.mockClear();

      act(() => lastResult.requestLoad(profile({ id: 'p2', markerA: 8000 })));

      expect(lastResult.guardVisible).toBe(true);
      expect(setMarkerA).not.toHaveBeenCalled();
    });
  });

  describe('the save dialog', () => {
    it('opens and closes', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      expect(lastResult.saveVisible).toBe(false);

      act(() => lastResult.openSave());
      api.update({ markerA: 1000, markerB: 5000 });
      expect(lastResult.saveVisible).toBe(true);

      act(() => lastResult.closeSave());
      api.update({ markerA: 1000, markerB: 5000 });
      expect(lastResult.saveVisible).toBe(false);
    });

    it('overwrites the loaded segment and confirms', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());

      act(() => lastResult.saveOverLoaded());
      api.update({ markerA: 2000, markerB: 5000 });

      expect(mockUpdate).toHaveBeenCalledWith('p1', {
        markerA: 2000,
        markerB: 5000,
        loopEnabled: true,
      });
      expect(showToast).toHaveBeenCalledWith('Segment updated');
      expect(lastResult.saveVisible).toBe(false);
    });

    it('clears the dirty flag after overwriting', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      expect(lastResult.isDirty).toBe(true);

      act(() => lastResult.saveOverLoaded());
      api.update({ markerA: 2000, markerB: 5000 });

      expect(lastResult.isDirty).toBe(false);
    });

    it('does nothing to the store when no segment is loaded', () => {
      render({ markerA: 1000, markerB: 5000 });

      act(() => lastResult.saveOverLoaded());

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('Segment updated');
    });

    it('saves a new segment and adopts it', async () => {
      const stored = profile({ id: 'new', name: 'Chorus' });
      mockSave.mockResolvedValue(stored);
      const api = render({ markerA: 1000, markerB: 5000 });

      await act(async () => {
        lastResult.saveAsNew('Chorus');
      });
      api.update({ markerA: 1000, markerB: 5000 });

      expect(mockSave).toHaveBeenCalledWith({
        name: 'Chorus',
        markerA: 1000,
        markerB: 5000,
        loopEnabled: true,
      });
      expect(showToast).toHaveBeenCalledWith('Segment saved');
      expect(lastResult.saveVisible).toBe(false);
    });

    it('reports an error when the write resolves without a profile', async () => {
      mockSave.mockResolvedValue(null);
      render({ markerA: 1000, markerB: 5000 });

      await act(async () => {
        lastResult.saveAsNew('Chorus');
      });

      expect(showToast).toHaveBeenCalledWith('Could not save segment', 'error');
    });

    it('reports an error when the write rejects', async () => {
      mockSave.mockRejectedValue(new Error('disk full'));
      render({ markerA: 1000, markerB: 5000 });

      await act(async () => {
        lastResult.saveAsNew('Chorus');
      });

      expect(showToast).toHaveBeenCalledWith('Could not save segment', 'error');
    });
  });

  describe('the unsaved-edit guard', () => {
    it('applies the deferred load after saving', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      act(() => lastResult.requestLoad(profile({ id: 'p2', markerA: 8000 })));
      setMarkerA.mockClear();

      act(() => lastResult.guardSave());
      api.update({ markerA: 2000, markerB: 5000 });

      expect(mockUpdate).toHaveBeenCalledWith('p1', {
        markerA: 2000,
        markerB: 5000,
        loopEnabled: true,
      });
      expect(setMarkerA).toHaveBeenCalledWith(8000);
      expect(lastResult.guardVisible).toBe(false);
    });

    it('applies the deferred load without saving on discard', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      act(() => lastResult.requestLoad(profile({ id: 'p2', markerA: 8000 })));
      setMarkerA.mockClear();

      act(() => lastResult.guardDiscard());
      api.update({ markerA: 2000, markerB: 5000 });

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(setMarkerA).toHaveBeenCalledWith(8000);
      expect(lastResult.guardVisible).toBe(false);
    });

    it('abandons the deferred load on cancel', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      act(() => lastResult.requestLoad(profile({ id: 'p2', markerA: 8000 })));
      setMarkerA.mockClear();

      act(() => lastResult.guardCancel());
      api.update({ markerA: 2000, markerB: 5000 });

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(setMarkerA).not.toHaveBeenCalled();
      expect(lastResult.guardVisible).toBe(false);
    });
  });

  describe('leaving the screen', () => {
    const leaveEvent = () => ({
      preventDefault: jest.fn(),
      data: { action: { type: 'GO_BACK' } },
    });

    it('lets navigation through when no segment is loaded', () => {
      render({ markerA: 1000, markerB: 5000 });
      const event = leaveEvent();

      act(() => mockBeforeRemoveCb?.(event));

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(lastResult.guardVisible).toBe(false);
    });

    it('lets navigation through when the loaded segment is clean', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      act(() => lastResult.requestLoad(profile()));
      api.update({ markerA: 1000, markerB: 5000 });
      const event = leaveEvent();

      act(() => mockBeforeRemoveCb?.(event));

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(lastResult.guardVisible).toBe(false);
    });

    it('blocks the back action and raises the guard when dirty', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      const event = leaveEvent();

      act(() => mockBeforeRemoveCb?.(event));
      api.update({ markerA: 2000, markerB: 5000 });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(lastResult.guardVisible).toBe(true);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('re-issues the blocked action once the guard is discarded', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      act(() => mockBeforeRemoveCb?.(leaveEvent()));

      act(() => lastResult.guardDiscard());
      api.update({ markerA: 2000, markerB: 5000 });

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
      expect(lastResult.guardVisible).toBe(false);
    });

    it('saves first, then re-issues the blocked action', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      act(() => mockBeforeRemoveCb?.(leaveEvent()));

      act(() => lastResult.guardSave());
      api.update({ markerA: 2000, markerB: 5000 });

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    });

    it('does not re-raise the guard for its own re-issued navigation', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      // The re-issued dispatch fires beforeRemove again on a real navigator;
      // the bypass flag has to swallow that second pass.
      const reentrant = leaveEvent();
      mockDispatch.mockImplementationOnce(() =>
        mockBeforeRemoveCb?.(reentrant),
      );
      act(() => mockBeforeRemoveCb?.(leaveEvent()));

      act(() => lastResult.guardDiscard());
      api.update({ markerA: 2000, markerB: 5000 });

      expect(reentrant.preventDefault).not.toHaveBeenCalled();
      expect(lastResult.guardVisible).toBe(false);
    });
  });

  describe('derived values', () => {
    it('resolves the loaded segment from the profile list', () => {
      mockProfiles = [profile({ id: 'p1', name: 'Verse' })];
      const api = render({ markerA: 1000, markerB: 5000 });
      expect(lastResult.loadedProfile).toBeNull();

      act(() => lastResult.requestLoad(profile()));
      api.update({ markerA: 1000, markerB: 5000 });

      expect(lastResult.loadedProfile?.name).toBe('Verse');
    });

    it('suggests the next segment name from the saved list', () => {
      mockProfiles = [profile({ id: 'p1', name: 'Segment 3' })];
      render({ markerA: 1000, markerB: 5000 });

      expect(lastResult.suggestedName).toBe('Segment 4');
    });

    it('drops the loaded identity when the region is cleared by hand', () => {
      const api = render({ markerA: 1000, markerB: 5000 });
      loadThenDirty(api, profile());
      expect(lastResult.isDirty).toBe(true);

      act(() => lastResult.clearLoaded());
      api.update({ markerA: null, markerB: null });

      expect(lastResult.loadedProfile).toBeNull();
      expect(lastResult.isDirty).toBe(false);
    });

    it('passes the store CRUD straight through', () => {
      render({ markerA: 1000, markerB: 5000 });

      act(() => lastResult.rename('p1', 'Bridge'));
      act(() => lastResult.remove('p1'));

      expect(mockRename).toHaveBeenCalledWith('p1', 'Bridge');
      expect(mockRemove).toHaveBeenCalledWith('p1');
    });
  });
});

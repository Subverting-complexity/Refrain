import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from 'expo-router';

import { ToastVariant } from '../components/Toast';
import { SegmentProfile } from '../types';
import { nextSegmentName } from '../utils/nextSegmentName';
import { useLatestRef } from './useLatestRef';
import { useSegmentEditor } from './useSegmentEditor';
import { useSegmentProfiles } from './useSegmentProfiles';

/** A pending action blocked by unsaved segment edits. */
type SegmentGuard =
  | { kind: 'load'; profile: SegmentProfile }
  | { kind: 'leave'; proceed: () => void };

export interface UseSegmentWorkflowParams {
  trackId: string | null;
  /** The live A/B region and loop flag, owned by the audio player. */
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
  /** Engine setters used to arm a loaded segment. */
  setMarkerA: (positionMs: number) => void;
  setMarkerB: (positionMs: number) => boolean;
  setLoopEnabled: (enabled: boolean) => void;
  showToast: (message: string, variant?: ToastVariant) => void;
}

export interface UseSegmentWorkflow {
  /** The track's saved segments, plus the CRUD the sheet drives directly. */
  profiles: SegmentProfile[];
  rename: (profileId: string, name: string) => void;
  remove: (profileId: string) => void;
  /** The loaded segment's record, or `null` when none is loaded. */
  loadedProfile: SegmentProfile | null;
  /** Whether the live region has moved away from the loaded segment. */
  isDirty: boolean;
  /** Forget the loaded segment — for when the region is cleared by hand. */
  clearLoaded: () => void;
  /** Default name offered for a new segment. */
  suggestedName: string;

  /** Save-dialog visibility. */
  saveVisible: boolean;
  openSave: () => void;
  closeSave: () => void;
  /** Save dialog: overwrite the loaded segment with the live region. */
  saveOverLoaded: () => void;
  /** Save dialog: store the live region as a new segment under `name`. */
  saveAsNew: (name: string) => void;

  /** Load a segment, raising the unsaved-edit guard first if needed. */
  requestLoad: (profile: SegmentProfile) => void;
  /** Whether the unsaved-edit guard is asking the user to decide. */
  guardVisible: boolean;
  /** Guard resolutions: save first, discard, or stay put. */
  guardSave: () => void;
  guardDiscard: () => void;
  guardCancel: () => void;
}

/**
 * The player's segment save/load workflow and the unsaved-edit guard that sits
 * in front of it.
 *
 * It owns the saved-segment list, which segment is loaded, both dialogs'
 * visibility, and the guard state machine — including the navigation intercept
 * that raises the guard when you leave the screen mid-edit. The live A/B region
 * stays with the audio player and is passed in, so there is exactly one source
 * of truth for the markers; everything here is about the *named* segment
 * wrapped around them.
 *
 * Callers get intent-level actions ("load this", "the guard was discarded")
 * rather than the state behind them.
 */
export function useSegmentWorkflow({
  trackId,
  markerA,
  markerB,
  loopEnabled,
  setMarkerA,
  setMarkerB,
  setLoopEnabled,
  showToast,
}: UseSegmentWorkflowParams): UseSegmentWorkflow {
  // Named-segment list + CRUD for this track. The player shows the loaded
  // segment's name and suggests the next one from it; the sheet receives the
  // list and the rename/remove actions as props.
  const { profiles, save, update, rename, remove } =
    useSegmentProfiles(trackId);
  // Tracks which segment is loaded and whether its A/B region has been edited.
  const { loadedId, isDirty, markLoaded, clearLoaded } = useSegmentEditor(
    markerA,
    markerB,
  );
  const loadedProfile = loadedId
    ? (profiles.find((p) => p.id === loadedId) ?? null)
    : null;

  const suggestedName = useMemo(() => nextSegmentName(profiles), [profiles]);

  // Whether the player's Save dialog is open.
  const [saveVisible, setSaveVisible] = useState(false);
  // A load/leave action deferred behind the unsaved-edit guard, or null.
  const [guard, setGuard] = useState<SegmentGuard | null>(null);

  const openSave = useCallback(() => setSaveVisible(true), []);
  const closeSave = useCallback(() => setSaveVisible(false), []);

  // Arm a saved profile on the engine: set A before B so the A < B invariant
  // holds (saved profiles always carry a valid region), then the loop flag, and
  // adopt it as the loaded segment. Each setter auto-persists the markers (#117).
  const applyProfile = useCallback(
    (profile: SegmentProfile) => {
      if (profile.markerA != null) setMarkerA(profile.markerA);
      if (profile.markerB != null) setMarkerB(profile.markerB);
      setLoopEnabled(profile.loopEnabled);
      markLoaded(profile);
    },
    [setMarkerA, setMarkerB, setLoopEnabled, markLoaded],
  );

  // Loading from the sheet. If the loaded segment has unsaved marker edits,
  // defer the load behind the guard; otherwise arm the new segment straight away.
  const requestLoad = useCallback(
    (profile: SegmentProfile) => {
      if (isDirty && loadedId) {
        setGuard({ kind: 'load', profile });
      } else {
        applyProfile(profile);
      }
    },
    [isDirty, loadedId, applyProfile],
  );

  // Overwrite the loaded segment with the live region, keeping it the loaded
  // segment. Advancing the dirty baseline via markLoaded is what keeps the
  // segment from re-reporting as dirty against its now-stale snapshot.
  const overwriteLoaded = useCallback(() => {
    if (loadedId) {
      update(loadedId, { markerA, markerB, loopEnabled });
      markLoaded({ id: loadedId, markerA, markerB });
    }
  }, [loadedId, update, markerA, markerB, loopEnabled, markLoaded]);

  // Save dialog: overwrite, close, and confirm.
  const saveOverLoaded = useCallback(() => {
    overwriteLoaded();
    setSaveVisible(false);
    showToast('Segment updated');
  }, [overwriteLoaded, showToast]);

  // Save dialog: create a new segment, then adopt it as the loaded one. The
  // success toast waits for the write to resolve with a stored profile; a
  // falsy result or a rejection reports an error instead of falsely claiming
  // success, and the rejection is caught so none escapes unhandled.
  const saveAsNew = useCallback(
    (name: string) => {
      setSaveVisible(false);
      void save({ name, markerA, markerB, loopEnabled })
        .then((profile) => {
          if (profile) {
            markLoaded(profile);
            showToast('Segment saved');
          } else {
            showToast('Could not save segment', 'error');
          }
        })
        .catch(() => {
          showToast('Could not save segment', 'error');
        });
    },
    [save, markerA, markerB, loopEnabled, markLoaded, showToast],
  );

  // Carry out a guarded action once the user resolves the unsaved-edit prompt.
  const proceedGuard = useCallback(
    (pending: SegmentGuard) => {
      if (pending.kind === 'load') applyProfile(pending.profile);
      else pending.proceed();
    },
    [applyProfile],
  );

  // Guard "Save": overwrite the loaded segment, then carry on.
  const guardSave = useCallback(() => {
    overwriteLoaded();
    if (guard) proceedGuard(guard);
    setGuard(null);
  }, [overwriteLoaded, guard, proceedGuard]);

  // Guard "Discard": carry on without saving the named segment. Live per-track
  // markers persist as today (#117); a load overwrites them as usual.
  const guardDiscard = useCallback(() => {
    if (guard) proceedGuard(guard);
    setGuard(null);
  }, [guard, proceedGuard]);

  const guardCancel = useCallback(() => setGuard(null), []);

  // Refs let the navigation listener read the latest dirty/loaded state without
  // re-subscribing every render; the bypass flag lets a resolved guard navigate
  // through without re-triggering itself.
  const dirtyRef = useLatestRef(isDirty);
  const loadedIdRef = useLatestRef(loadedId);
  const bypassGuardRef = useRef(false);

  // Leaving the player with unsaved segment edits: intercept the back action
  // and raise the same guard. Fires for in-app Stack back navigation.
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (bypassGuardRef.current) return;
      if (!dirtyRef.current || !loadedIdRef.current) return;
      event.preventDefault();
      setGuard({
        kind: 'leave',
        proceed: () => {
          bypassGuardRef.current = true;
          navigation.dispatch(event.data.action);
          bypassGuardRef.current = false;
        },
      });
    });
    return unsubscribe;
    // The refs are stable across renders, so listing them keeps the listener
    // subscribed exactly once — as it was when they were inline `useRef`s.
  }, [navigation, dirtyRef, loadedIdRef]);

  return {
    profiles,
    rename,
    remove,
    loadedProfile,
    isDirty,
    clearLoaded,
    suggestedName,
    saveVisible,
    openSave,
    closeSave,
    saveOverLoaded,
    saveAsNew,
    requestLoad,
    guardVisible: guard != null,
    guardSave,
    guardDiscard,
    guardCancel,
  };
}

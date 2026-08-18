import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteProfile,
  listProfiles,
  renameProfile,
  saveProfile,
  updateProfile,
} from '../services/markerStore';
import { SegmentProfile, SegmentProfileInput } from '../types';
import { settle } from '../utils/settle';

/** The region fields overwritten when saving edited markers back. */
export type SegmentRegion = Pick<
  SegmentProfile,
  'markerA' | 'markerB' | 'loopEnabled'
>;

export interface UseSegmentProfiles {
  /** The current track's saved profiles, in stable (oldest-first) order. */
  profiles: SegmentProfile[];
  /** Re-read the profile list from the store. */
  refresh: () => void;
  /**
   * Persist a new profile for the current track, then refresh. Resolves with
   * the stored record so the caller can adopt it as the loaded segment, or
   * `null` when there is no track or the write fails.
   */
  save: (input: SegmentProfileInput) => Promise<SegmentProfile | null>;
  /** Overwrite a profile's A/B region and loop flag by id, then refresh. */
  update: (profileId: string, region: SegmentRegion) => void;
  /** Rename a profile by id, then refresh. */
  rename: (profileId: string, name: string) => void;
  /** Delete a profile by id, then refresh. */
  remove: (profileId: string) => void;
}

/**
 * Owns the saved segment-profile list and its CRUD for one track, hiding the
 * native/web split in `markerStore`: native is synchronous, web returns
 * Promises, so every call goes through {@link settle} and the result is
 * applied once it settles. All writes refresh the list. Persistence is
 * best-effort — a failed read or write leaves the last good list in place
 * rather than throwing into the UI.
 */
export function useSegmentProfiles(trackId: string | null): UseSegmentProfiles {
  const [profiles, setProfiles] = useState<SegmentProfile[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Sequence number for reads. On web `listProfiles` is async, so a slow read
  // for one track can resolve *after* a later one — switching tracks quickly,
  // or any two overlapping refreshes, could otherwise leave the previous
  // track's segments on screen. Only the newest read is allowed to apply.
  const latestRead = useRef(0);

  const refresh = useCallback(() => {
    const readId = ++latestRead.current;
    const apply = (rows: SegmentProfile[]) => {
      if (mounted.current && latestRead.current === readId) setProfiles(rows);
    };

    if (!trackId) {
      apply([]);
      return;
    }
    void settle(() => listProfiles(trackId))
      .then(apply)
      .catch(() => apply([]));
  }, [trackId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (input: SegmentProfileInput): Promise<SegmentProfile | null> => {
      if (!trackId) return null;
      try {
        const profile = await settle(() => saveProfile(trackId, input));
        refresh();
        return profile;
      } catch {
        return null;
      }
    },
    [trackId, refresh],
  );

  // Every mutation is the same shape: run the store call across the sync/async
  // platform split, refresh the list on success, and stay silent on failure so
  // the last good list survives.
  const runWrite = useCallback(
    (call: () => unknown) => {
      void settle(call)
        .then(refresh)
        .catch(() => {});
    },
    [refresh],
  );

  const update = useCallback(
    (profileId: string, region: SegmentRegion) =>
      runWrite(() => updateProfile(profileId, region)),
    [runWrite],
  );

  const rename = useCallback(
    (profileId: string, name: string) =>
      runWrite(() => renameProfile(profileId, name)),
    [runWrite],
  );

  const remove = useCallback(
    (profileId: string) => runWrite(() => deleteProfile(profileId)),
    [runWrite],
  );

  return { profiles, refresh, save, update, rename, remove };
}

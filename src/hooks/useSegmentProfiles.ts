import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteProfile,
  listProfiles,
  renameProfile,
  saveProfile,
  updateProfile,
} from '../services/markerStore';
import { SegmentProfile, SegmentProfileInput } from '../types';

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
 * Promises, so every call is wrapped in `Promise.resolve` and the result is
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

  const apply = useCallback((rows: SegmentProfile[]) => {
    if (mounted.current) setProfiles(rows);
  }, []);

  const refresh = useCallback(() => {
    if (!trackId) {
      apply([]);
      return;
    }
    try {
      void Promise.resolve(listProfiles(trackId))
        .then(apply)
        .catch(() => apply([]));
    } catch {
      apply([]);
    }
  }, [trackId, apply]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (input: SegmentProfileInput): Promise<SegmentProfile | null> => {
      if (!trackId) return null;
      try {
        const profile = await Promise.resolve(saveProfile(trackId, input));
        refresh();
        return profile;
      } catch {
        return null;
      }
    },
    [trackId, refresh],
  );

  const update = useCallback(
    (profileId: string, region: SegmentRegion) => {
      try {
        void Promise.resolve(updateProfile(profileId, region))
          .then(refresh)
          .catch(() => {});
      } catch {
        // best-effort
      }
    },
    [refresh],
  );

  const rename = useCallback(
    (profileId: string, name: string) => {
      try {
        void Promise.resolve(renameProfile(profileId, name))
          .then(refresh)
          .catch(() => {});
      } catch {
        // best-effort
      }
    },
    [refresh],
  );

  const remove = useCallback(
    (profileId: string) => {
      try {
        void Promise.resolve(deleteProfile(profileId))
          .then(refresh)
          .catch(() => {});
      } catch {
        // best-effort
      }
    },
    [refresh],
  );

  return { profiles, refresh, save, update, rename, remove };
}

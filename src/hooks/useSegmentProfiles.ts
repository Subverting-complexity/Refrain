import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteProfile,
  listProfiles,
  renameProfile,
  saveProfile,
} from '../services/markerStore';
import { SegmentProfile, SegmentProfileInput } from '../types';

export interface UseSegmentProfiles {
  /** The current track's saved profiles, in stable (oldest-first) order. */
  profiles: SegmentProfile[];
  /** Re-read the profile list from the store. */
  refresh: () => void;
  /** Persist a new profile for the current track, then refresh. */
  save: (input: SegmentProfileInput) => void;
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
    (input: SegmentProfileInput) => {
      if (!trackId) return;
      try {
        void Promise.resolve(saveProfile(trackId, input))
          .then(refresh)
          .catch(() => {});
      } catch {
        // best-effort
      }
    },
    [trackId, refresh],
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

  return { profiles, refresh, save, rename, remove };
}

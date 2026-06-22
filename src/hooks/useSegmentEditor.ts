import { useCallback, useMemo, useState } from 'react';

import { SegmentProfile } from '../types';

/** The loaded segment's identity plus the A/B snapshot it was loaded with. */
interface LoadedSnapshot {
  id: string;
  markerA: number | null;
  markerB: number | null;
}

export interface UseSegmentEditor {
  /** Id of the segment currently loaded into the player, or `null`. */
  loadedId: string | null;
  /**
   * Whether the live A/B region has moved away from the loaded segment's saved
   * values. Only A/B movement counts — loop, volume, count-in, and snippet
   * changes never make a segment dirty.
   */
  isDirty: boolean;
  /** Adopt a segment as loaded, snapshotting its A/B region as the baseline. */
  markLoaded: (
    profile: Pick<SegmentProfile, 'id' | 'markerA' | 'markerB'>,
  ) => void;
  /** Forget the loaded segment (e.g. when the region is cleared by hand). */
  clearLoaded: () => void;
}

/**
 * Tracks which named segment is loaded in the player and whether its A/B region
 * has been edited since loading. The live markers are passed in (owned by the
 * audio player); this hook only remembers the loaded baseline and derives the
 * dirty flag from it, so saving back and the unsaved-edit guard have a single
 * source of truth.
 */
export function useSegmentEditor(
  markerA: number | null,
  markerB: number | null,
): UseSegmentEditor {
  const [loaded, setLoaded] = useState<LoadedSnapshot | null>(null);

  const markLoaded = useCallback(
    (profile: Pick<SegmentProfile, 'id' | 'markerA' | 'markerB'>) => {
      setLoaded({
        id: profile.id,
        markerA: profile.markerA,
        markerB: profile.markerB,
      });
    },
    [],
  );

  const clearLoaded = useCallback(() => setLoaded(null), []);

  const isDirty = useMemo(() => {
    if (!loaded) return false;
    return loaded.markerA !== markerA || loaded.markerB !== markerB;
  }, [loaded, markerA, markerB]);

  return { loadedId: loaded?.id ?? null, isDirty, markLoaded, clearLoaded };
}

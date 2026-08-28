/**
 * The audio engine's debounced marker persistence.
 *
 * One small unit with one boundary: it owns the debounce timer and every call
 * into `markerStore`, and it owns nothing else. The engine keeps the markers
 * themselves and tells this module how to read them.
 *
 * Split out of `audioEngine.ts`, where the timer sat among the engine's other
 * module variables and the four functions were interleaved with playback code
 * that has nothing to do with saving. Gathered here, the whole debounce rule —
 * when a write is queued, what cancels it, what flushes it — reads in one
 * place and can be tested without an audio player.
 *
 * ## Best-effort throughout
 *
 * Every write and read is best-effort and its failure is swallowed. A store
 * that will not write must never surface as a playback error: the user is
 * listening to a track, and losing a marker position is a smaller harm than
 * an error banner over a working player. The engine's own suites cover the
 * playback consequences; this module's cover the persistence.
 */

import * as markerStore from './markerStore';
import { ActiveMarkers } from '../types';
import { settle } from '../utils/settle';

/**
 * Trailing-edge debounce for per-track marker writes. A marker drag fires
 * changes at the ~20/sec drag-throttle cadence; coalescing them into one write
 * this far after the last change avoids a write storm while still capturing the
 * final value (the timer always writes the latest markers, never a stale one).
 */
export const MARKER_SAVE_DEBOUNCE_MS = 300;

/** What the engine hands this module so it can read the state it saves. */
export interface MarkerPersistenceDeps {
  /** The loaded track's id, or null when the load carried none. */
  getTrackId: () => string | null;
  /** The marker set as it stands right now. */
  getMarkers: () => ActiveMarkers;
}

/** The debounced-save unit returned by {@link createMarkerPersistence}. */
export interface MarkerPersistence {
  /** Write the current markers now, bypassing the debounce. */
  write: () => void;
  /** Queue a debounced write, resetting any timer already running. */
  schedule: () => void;
  /** Write a queued change immediately, if one is pending. */
  flush: () => void;
  /** The saved markers for a track, or null when there are none to restore. */
  restore: (trackId: string) => Promise<ActiveMarkers | null>;
}

/**
 * Build a marker-persistence unit over the engine's marker state.
 *
 * A factory rather than a module of free functions because of the timer: it is
 * mutable state, and a test that could not start from a fresh one would be
 * reading the leftovers of whichever test ran before it.
 */
export function createMarkerPersistence(
  deps: MarkerPersistenceDeps,
): MarkerPersistence {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Write the current marker set for the loaded track to the store.
   * Platform-agnostic: the native store is synchronous and the web store
   * returns a promise, so the call goes through `settle`. No-op when no track
   * id is associated with the load.
   */
  function write(): void {
    const trackId = deps.getTrackId();
    if (trackId == null) return;
    const snapshot = deps.getMarkers();
    void settle(() => markerStore.setActiveMarkers(trackId, snapshot)).catch(
      () => {
        // Persistence is best-effort; swallow write failures on both platforms.
      },
    );
  }

  /**
   * Queue a debounced persist of the active markers. Each marker change resets
   * the timer, so a burst of changes (e.g. a drag) collapses into a single
   * write carrying the final value. No-op when the track has no id.
   */
  function schedule(): void {
    if (deps.getTrackId() == null) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      write();
    }, MARKER_SAVE_DEBOUNCE_MS);
  }

  /**
   * Flush any queued marker save immediately. Called before the loaded track is
   * torn down so a change made within the debounce window is persisted for the
   * outgoing track rather than lost (or clobbered by the unload reset).
   */
  function flush(): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      write();
    }
  }

  /**
   * The persisted markers for a track, or null when there is nothing to
   * restore or the read failed.
   *
   * Returns the markers rather than applying them, which is the one shape
   * change made while extracting this group. In `audioEngine.ts` this reached
   * into the engine's marker variables and notified listeners itself; handing
   * the values back leaves this module owning storage and the engine owning
   * its own state. A track with no saved row reads as null and the engine
   * keeps its post-load defaults, exactly as before.
   */
  async function restore(trackId: string): Promise<ActiveMarkers | null> {
    try {
      const saved = await settle(() => markerStore.getActiveMarkers(trackId));
      return saved ?? null;
    } catch {
      // Best-effort: a failed restore leaves the track with empty markers.
      return null;
    }
  }

  return { write, schedule, flush, restore };
}

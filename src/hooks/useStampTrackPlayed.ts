import { useEffect, useRef } from 'react';

import { markTrackPlayed } from '../services/trackStore';
import { PlaybackStatus } from '../types';
import { settle } from '../utils/settle';

/**
 * Stamp a track as played the first time playback genuinely starts, once per
 * visit.
 *
 * Opening the player is deliberately not the trigger. Refrain is a looper:
 * you open a track and work on it for twenty minutes, and you pass through
 * several while deciding what to work on. If merely opening the screen
 * counted, browsing would scramble the order and "recently played" would
 * degrade into "recently tapped" — which is a worse answer to the same
 * question, because it is the one the reader can already get from the list
 * they just came from.
 *
 * The guard also covers the loop itself. A track paused and resumed, or an
 * A/B loop rewinding, transitions back to playing repeatedly; only the first
 * transition of a visit writes.
 *
 * Persistence is best-effort. A track that plays but is not stamped has
 * still played, so a failure must never surface or interrupt anything — it
 * is retried on the next visit.
 */
export function useStampTrackPlayed(
  trackId: string | null,
  status: PlaybackStatus,
): void {
  const stamped = useRef(false);

  // Reset before the stamping effect below, so switching tracks within one
  // mounted player stamps the new track rather than dropping it. Declared
  // first so on a trackId change the reset runs first, in the same commit.
  useEffect(() => {
    stamped.current = false;
  }, [trackId]);

  useEffect(() => {
    if (!trackId || status !== 'playing' || stamped.current) return;
    // Set the guard before the write, not after: the write is asynchronous
    // on web, and a second 'playing' transition arriving first would
    // otherwise stamp twice.
    stamped.current = true;
    void settle(() => markTrackPlayed(trackId, Date.now())).catch(() => {
      // Ordering hint only — leave the guard set so a failure cannot turn
      // into a write on every later loop rewind.
    });
  }, [trackId, status]);
}

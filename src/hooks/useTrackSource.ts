import { useEffect, useState } from 'react';

import { getTrack } from '../services/trackStore';

export interface TrackSource {
  /** Playable uri for the track, or `null` while it is still being resolved. */
  uri: string | null;
  /** The track's filename, preferring the stored record over the route param. */
  filename: string | null;
  /** True while the store lookup for `trackId` is in flight. */
  isResolving: boolean;
  /**
   * True once the lookup finished and neither the store nor the route param
   * yielded something playable — the track is gone from the library.
   */
  isMissing: boolean;
}

/**
 * Resolves the playable uri for the player screen from a track id, treating any
 * uri handed in through the route as a fallback only.
 *
 * A uri captured at navigation time cannot be trusted for the lifetime of the
 * route. On web `Track.uri` is a `blob:` object URL owned by the document that
 * created it, so it dies on reload, on a restored history entry, and on a
 * shared or bookmarked link — the route params survive but the uri in them
 * points at nothing, and playback fails with a bare media error. On native the
 * risk is milder but real: an absolute path captured before an iOS sandbox
 * rotation no longer resolves. Re-reading the track from the store on mount
 * gives the player a uri that is valid *now* on both platforms.
 *
 * The route's `uri`/`filename` params are still honoured when there is no track
 * id (an ad-hoc deep link) or when the id is not in the library, so nothing
 * that worked before stops working.
 */
export function useTrackSource(
  trackId: string | null,
  fallbackUri: string | null,
  fallbackFilename: string | null,
): TrackSource {
  // Resolution is tagged with the id it belongs to so a late result for a
  // previous track can never overwrite the current one.
  const [resolved, setResolved] = useState<{
    trackId: string;
    uri: string | null;
    filename: string | null;
  } | null>(null);

  useEffect(() => {
    if (!trackId) return;

    let cancelled = false;
    const finish = (uri: string | null, filename: string | null) => {
      if (!cancelled) setResolved({ trackId, uri, filename });
    };

    // The native store is synchronous and the web store returns a promise;
    // Promise.resolve flattens both. A read failure falls back to the route
    // param rather than stranding the screen with no source at all.
    try {
      void Promise.resolve(getTrack(trackId))
        .then((track) => finish(track?.uri ?? null, track?.filename ?? null))
        .catch(() => finish(null, null));
    } catch {
      finish(null, null);
    }

    return () => {
      cancelled = true;
    };
  }, [trackId]);

  if (!trackId) {
    return {
      uri: fallbackUri,
      filename: fallbackFilename,
      isResolving: false,
      isMissing: fallbackUri == null,
    };
  }

  const isResolving = resolved?.trackId !== trackId;
  if (isResolving) {
    return {
      uri: null,
      filename: fallbackFilename,
      isResolving: true,
      isMissing: false,
    };
  }

  const uri = resolved.uri ?? fallbackUri;
  return {
    uri,
    filename: resolved.filename ?? fallbackFilename,
    isResolving: false,
    isMissing: uri == null,
  };
}

import { useEffect, useState } from 'react';

import { extractPeaks } from '../services/waveformAnalyzer';
import { WaveformPeaks } from '../types';

interface WaveformDataState {
  peaks: WaveformPeaks;
  isLoading: boolean;
}

const EMPTY_PEAKS: WaveformPeaks = [];

/**
 * How long to leave the JS thread alone before starting the analysis.
 *
 * `extractPeaks` is declared async but has nothing to await: its body runs to
 * completion in one go, and while it does, nothing else on the JS thread runs —
 * including the player's own load, the status callbacks it produces, and the
 * first paint of the screen the effect belongs to. Starting it from a timer
 * rather than from the effect body lets the commit finish and the screen appear
 * before any of that work begins, so a track opens immediately and the wave
 * arrives a moment later rather than the other way round.
 */
const START_DELAY_MS = 0;

export function useWaveformData(uri: string | null): WaveformDataState {
  // The loaded result is tagged with the uri it belongs to. State is only ever
  // written from the async extraction callbacks (never synchronously in the
  // effect), and `peaks`/`isLoading` are derived from it below — so a missing
  // track or an in-flight load needs no synchronous setState in the effect.
  const [loaded, setLoaded] = useState<{
    uri: string;
    peaks: WaveformPeaks;
  } | null>(null);

  useEffect(() => {
    if (!uri) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      extractPeaks(uri)
        .then((result) => {
          if (!cancelled) setLoaded({ uri, peaks: result });
        })
        .catch(() => {
          if (!cancelled) setLoaded({ uri, peaks: EMPTY_PEAKS });
        });
    }, START_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);

  // Only surface peaks that belong to the current uri; otherwise we're either
  // idle (no track) or still loading, both of which read as empty + loading.
  const hasPeaksForUri = loaded != null && loaded.uri === uri;
  const peaks = hasPeaksForUri ? loaded.peaks : EMPTY_PEAKS;
  const isLoading = uri != null && !hasPeaksForUri;
  return { peaks, isLoading };
}

import { useEffect, useState } from 'react';

import { extractPeaks } from '../services/waveformAnalyzer';
import { WaveformPeaks } from '../types';

interface WaveformDataState {
  peaks: WaveformPeaks;
  isLoading: boolean;
}

const EMPTY_PEAKS: WaveformPeaks = [];

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

    extractPeaks(uri)
      .then((result) => {
        if (!cancelled) setLoaded({ uri, peaks: result });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ uri, peaks: EMPTY_PEAKS });
      });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  // Only surface peaks that belong to the current uri; otherwise we're either
  // idle (no track) or still loading, both of which read as empty + loading.
  const hasPeaksForUri = loaded != null && loaded.uri === uri;
  const peaks = hasPeaksForUri ? loaded.peaks : EMPTY_PEAKS;
  const isLoading = uri != null && !hasPeaksForUri;
  return { peaks, isLoading };
}

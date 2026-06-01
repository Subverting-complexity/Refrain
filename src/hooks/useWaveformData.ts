import { useEffect, useState } from 'react';

import { extractPeaks } from '../services/waveformAnalyzer';
import { WaveformPeaks } from '../types';

interface WaveformDataState {
  peaks: WaveformPeaks;
  isLoading: boolean;
}

const EMPTY_PEAKS: WaveformPeaks = [];

export function useWaveformData(uri: string | null): WaveformDataState {
  const [peaks, setPeaks] = useState<WaveformPeaks>(EMPTY_PEAKS);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!uri) {
      setPeaks(EMPTY_PEAKS);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    extractPeaks(uri)
      .then((result) => {
        if (!cancelled) setPeaks(result);
      })
      .catch(() => {
        if (!cancelled) setPeaks(EMPTY_PEAKS);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return { peaks, isLoading };
}

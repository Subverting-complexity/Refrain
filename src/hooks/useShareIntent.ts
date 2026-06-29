import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import { importFromUri, isSupportedFilename } from '../services/fileImport';
import { Track } from '../types';
import { extractFilename } from '../utils/extractFilename';
import { useLatestRef } from './useLatestRef';

interface UseShareIntentOptions {
  onTrackImported: (track: Track) => void;
  onError?: (message: string) => void;
}

export function useShareIntent({
  onTrackImported,
  onError,
}: UseShareIntentOptions) {
  const onTrackImportedRef = useLatestRef(onTrackImported);
  const onErrorRef = useLatestRef(onError);

  useEffect(() => {
    // Share intents are a native-only concept, and expo-file-system's File
    // API is unsupported on web. On web, getInitialURL returns the page URL,
    // which would be misread as a shared audio file and crash File import.
    if (Platform.OS === 'web') return;

    async function handleUrl(url: string) {
      const filename = extractFilename(url);

      if (!isSupportedFilename(filename)) {
        onErrorRef.current?.('Unsupported audio format');
        return;
      }

      const result = await importFromUri(url, filename);
      if (result.success) {
        onTrackImportedRef.current(result.track);
      } else {
        onErrorRef.current?.(result.message);
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => subscription.remove();
  }, []);
}

import { useEffect } from 'react';
import * as Linking from 'expo-linking';

import { importFromUri, isSupportedFilename } from '../services/fileImport';
import { Track } from '../types';

interface UseShareIntentOptions {
  onTrackImported: (track: Track) => void;
  onError?: (message: string) => void;
}

export function useShareIntent({
  onTrackImported,
  onError,
}: UseShareIntentOptions) {
  useEffect(() => {
    async function handleUrl(url: string) {
      const filename = url.split('/').pop() ?? 'shared-audio.mp3';

      if (!isSupportedFilename(filename)) {
        onError?.('Unsupported audio format');
        return;
      }

      const result = await importFromUri(url, filename);
      if (result.success) {
        onTrackImported(result.track);
      } else {
        onError?.(result.message);
      }
    }

    // Handle URL that opened the app
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Handle URLs while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => subscription.remove();
  }, [onTrackImported, onError]);
}

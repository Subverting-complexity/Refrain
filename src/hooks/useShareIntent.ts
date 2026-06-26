import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import { importFromUri, isSupportedFilename } from '../services/fileImport';
import { Track } from '../types';
import { extractFilename } from '../utils/extractFilename';

interface UseShareIntentOptions {
  onTrackImported: (track: Track) => void;
  onError?: (message: string) => void;
}

export function useShareIntent({
  onTrackImported,
  onError,
}: UseShareIntentOptions) {
  // Keep the latest callbacks in refs so the mount-only effect below always
  // calls current handlers without re-subscribing. Writes happen in an effect,
  // not during render.
  const onTrackImportedRef = useRef(onTrackImported);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTrackImportedRef.current = onTrackImported;
    onErrorRef.current = onError;
  });

  // Records the initial URL once it has been handled. The mount effect runs
  // twice under StrictMode (dev), and getInitialURL can resolve in a race in
  // production, either of which could import the same shared file twice. This
  // ref survives effect re-runs (it belongs to the component, not the effect),
  // so a given initial URL is imported at most once.
  const handledInitialUrlRef = useRef<string | null>(null);

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
      // Check-and-set synchronously so the second effect run's resolution
      // (StrictMode or a production race) sees the URL already claimed and
      // skips it. Subsequent foreground shares arrive via the 'url' event
      // below, which is intentionally not guarded.
      if (url && handledInitialUrlRef.current !== url) {
        handledInitialUrlRef.current = url;
        handleUrl(url);
      }
    });

    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => subscription.remove();
  }, []);
}

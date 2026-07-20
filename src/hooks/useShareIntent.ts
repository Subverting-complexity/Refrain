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

  useEffect(() => {
    // Share intents are a native-only concept, and expo-file-system's File
    // API is unsupported on web. On web, getInitialURL returns the page URL,
    // which would be misread as a shared audio file and crash File import.
    if (Platform.OS === 'web') return;

    async function handleUrl(url: string) {
      // Only file/content URLs carry a shared audio file. The app's own deep
      // links (refrain://, exp:// in dev clients) arrive through the same
      // Linking events; ignore them silently instead of surfacing a spurious
      // "Unsupported audio format" error on every deep-link launch.
      if (!/^(file|content):/i.test(url)) return;

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

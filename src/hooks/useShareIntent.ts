import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useShareIntent as useExpoShareIntent } from 'expo-share-intent';

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

  // System share sheet (Android ACTION_SEND, iOS share-extension target).
  // Safe to call unconditionally on every platform: expo-share-intent loads
  // its native module optionally and defaults `disabled` to true on web, so
  // this is a no-op wherever the native module is absent (web, Expo Go).
  const {
    hasShareIntent,
    shareIntent,
    resetShareIntent,
    error: shareIntentError,
  } = useExpoShareIntent();

  useEffect(() => {
    if (!hasShareIntent) return;
    const files = shareIntent.files ?? [];

    // Consume the intent before the async import starts: re-renders while
    // the file copy is in flight must not re-process the same share. Same
    // once-per-share guard semantics as the URL flow below, where each
    // Linking URL is delivered (and handled) exactly once.
    resetShareIntent();

    (async () => {
      for (const file of files) {
        const filename = file.fileName || extractFilename(file.path);

        if (!isSupportedFilename(filename)) {
          onErrorRef.current?.('Unsupported audio format');
          continue;
        }

        const result = await importFromUri(file.path, filename);
        if (result.success) {
          onTrackImportedRef.current(result.track);
        } else {
          onErrorRef.current?.(result.message);
        }
      }
    })();
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    if (shareIntentError) {
      onErrorRef.current?.(shareIntentError);
    }
  }, [shareIntentError]);

  // "Open with" / "open in place" (Android VIEW intents, iOS document types)
  // still arrive as plain URLs through expo-linking — expo-share-intent only
  // covers the SEND share sheet.
  useEffect(() => {
    // File URLs are a native-only concept, and expo-file-system's File API is
    // unsupported on web. On web, getInitialURL returns the page URL, which
    // would be misread as a shared audio file and crash File import.
    if (Platform.OS === 'web') return;

    async function handleUrl(url: string) {
      // Only file/content URLs carry a shared audio file. The app's own deep
      // links (refrain://, exp:// in dev clients) arrive through the same
      // Linking events — including the share extension's
      // `refrain://dataUrl=…` redirect, which the share-intent effect above
      // handles. Ignore them silently instead of surfacing a spurious
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

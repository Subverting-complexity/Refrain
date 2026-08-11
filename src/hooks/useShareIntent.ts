import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useShareIntent as useExpoShareIntent } from 'expo-share-intent';

import { importFromUri, isSupportedFilename } from '../services/fileImport';
import { Track } from '../types';
import { errorMessage } from '../utils/errorMessage';
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
  // Keep the latest callbacks in refs so the mount-only effect below always
  // calls current handlers without re-subscribing. Writes happen in an effect,
  // not during render.
  const onTrackImportedRef = useLatestRef(onTrackImported);
  const onErrorRef = useLatestRef(onError);

  // Records the initial URL once it has been handled. The mount effect runs
  // twice under StrictMode (dev), and getInitialURL can resolve in a race in
  // production, either of which could import the same shared file twice. This
  // ref survives effect re-runs (it belongs to the component, not the effect),
  // so a given initial URL is imported at most once.
  const handledInitialUrlRef = useRef<string | null>(null);

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

    void (async () => {
      for (const file of files) {
        const filename = file.fileName || extractFilename(file.path);

        if (!isSupportedFilename(filename)) {
          onErrorRef.current?.('Unsupported audio format');
          continue;
        }

        // `importFromUri` resolves to an outcome for the failures it expects,
        // but it can still throw outright — the native path constructs an
        // expo-file-system `File` and reads `.exists` before its own try, so a
        // malformed shared path escapes. Catch per file so one bad share is
        // reported through onError instead of becoming an unhandled rejection,
        // and so it does not abort the files queued behind it.
        try {
          const result = await importFromUri(file.path, filename);
          if (result.success) {
            onTrackImportedRef.current(result.track);
          } else {
            onErrorRef.current?.(result.message);
          }
        } catch (error) {
          onErrorRef.current?.(errorMessage(error));
        }
      }
    })().catch(() => undefined);
    // The callback refs are stable, so this still re-runs only per share.
  }, [
    hasShareIntent,
    shareIntent,
    resetShareIntent,
    onTrackImportedRef,
    onErrorRef,
  ]);

  useEffect(() => {
    if (shareIntentError) {
      onErrorRef.current?.(shareIntentError);
    }
  }, [shareIntentError, onErrorRef]);

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

      // Same reasoning as the share-intent path above: importFromUri can throw
      // on a malformed file/content URI, and both call sites below are
      // fire-and-forget, so an escaping rejection would go unhandled instead of
      // reaching the caller's onError.
      try {
        const result = await importFromUri(url, filename);
        if (result.success) {
          onTrackImportedRef.current(result.track);
        } else {
          onErrorRef.current?.(result.message);
        }
      } catch (error) {
        onErrorRef.current?.(errorMessage(error));
      }
    }

    Linking.getInitialURL()
      .then((url) => {
        // Check-and-set synchronously so the second effect run's resolution
        // (StrictMode or a production race) sees the URL already claimed and
        // skips it. Subsequent foreground shares arrive via the 'url' event
        // below, which is intentionally not guarded.
        if (url && handledInitialUrlRef.current !== url) {
          handledInitialUrlRef.current = url;
          void handleUrl(url);
        }
      })
      .catch(() => {
        // No initial URL is recoverable — the app simply launched without a
        // share. Nothing to report.
      });

    const subscription = Linking.addEventListener('url', (event) => {
      void handleUrl(event.url);
    });

    return () => subscription.remove();
    // The callback refs are stable, so this stays a mount-only subscription.
  }, [onTrackImportedRef, onErrorRef]);
}

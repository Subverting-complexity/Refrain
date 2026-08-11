import { useCallback, useEffect, useState } from 'react';

import { hydrateSettings } from '../services/settingsStore';
import {
  getSnippetPreviewEnabled,
  setSnippetPreviewEnabled as persistSnippetPreviewEnabled,
} from '../services/snippetPreviewStore';

// Mirrors the store's default so a storage failure lands on the same value an
// unset preference would (matching how useSkipInterval holds its own default).
const DEFAULT_SNIPPET_PREVIEW_ENABLED = true;

/**
 * Read the persisted preference, or `null` when storage is unreachable. The
 * native store reads SQLite synchronously and can throw, so this never throws
 * — a preference read must not take down the render.
 *
 * Failure is reported as `null` rather than the default so callers can tell
 * "no value" from "the value is on": the post-hydration re-read below must
 * leave a good seed alone instead of clobbering it with a guess.
 */
function readPersistedSnippetPreview(): boolean | null {
  try {
    return getSnippetPreviewEnabled();
  } catch {
    return null;
  }
}

/**
 * React state for the snippet-preview preference, seeded once from the
 * persisted value (synchronous on every platform: native reads SQLite, web
 * reads the in-memory cache). Updating it both re-renders consumers and
 * persists the new value through the store.
 *
 * Every storage touch is best-effort, matching `useSkipInterval`: a failed
 * read, hydration, or write leaves the last usable value in place rather than
 * throwing into a render or an event handler.
 */
export function useSnippetPreview() {
  const [snippetPreviewEnabled, setEnabled] = useState<boolean>(
    () => readPersistedSnippetPreview() ?? DEFAULT_SNIPPET_PREVIEW_ENABLED,
  );

  // On a cold web load the cache may still be empty when the lazy seed above
  // runs, so a persisted-off value reads as the default-on (#163). Re-read
  // once hydration resolves to reapply it. No-op on native (hydration is a
  // resolved no-op and the seed was already correct).
  useEffect(() => {
    let cancelled = false;
    try {
      void Promise.resolve(hydrateSettings())
        .then(() => {
          const persisted = readPersistedSnippetPreview();
          // Only a real read corrects the seed. A failed one has nothing to
          // correct with, so replacing the seed with the default would be the
          // very clobber #163 was about.
          if (!cancelled && persisted !== null) setEnabled(persisted);
        })
        .catch(() => undefined);
    } catch {
      // Best-effort: the lazy seed above already holds a usable value.
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const setSnippetPreviewEnabled = useCallback((enabled: boolean) => {
    setEnabled(enabled);
    try {
      persistSnippetPreviewEnabled(enabled);
    } catch {
      // Persistence is best-effort: a failed write must not break playback.
      // Matches useSkipInterval, which guards the identical settingsStore
      // write — unguarded, a storage throw here escapes into the toggle's
      // press handler (#186). The in-memory state above is already updated.
    }
  }, []);

  return { snippetPreviewEnabled, setSnippetPreviewEnabled };
}

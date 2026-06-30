import { useCallback, useEffect, useState } from 'react';

import { hydrateSettings } from '../services/settingsStore';
import {
  getSnippetPreviewEnabled,
  setSnippetPreviewEnabled as persistSnippetPreviewEnabled,
} from '../services/snippetPreviewStore';

/**
 * React state for the snippet-preview preference, seeded once from the
 * persisted value (synchronous on every platform: native reads SQLite, web
 * reads the in-memory cache). Updating it both re-renders consumers and
 * persists the new value through the store.
 */
export function useSnippetPreview() {
  const [snippetPreviewEnabled, setEnabled] = useState<boolean>(
    getSnippetPreviewEnabled,
  );

  // On a cold web load the cache may still be empty when the lazy seed above
  // runs, so a persisted-off value reads as the default-on (#163). Re-read
  // once hydration resolves to reapply it. No-op on native (hydration is a
  // resolved no-op and the seed was already correct).
  useEffect(() => {
    let cancelled = false;
    void hydrateSettings().then(() => {
      if (!cancelled) setEnabled(getSnippetPreviewEnabled());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSnippetPreviewEnabled = useCallback((enabled: boolean) => {
    setEnabled(enabled);
    persistSnippetPreviewEnabled(enabled);
  }, []);

  return { snippetPreviewEnabled, setSnippetPreviewEnabled };
}

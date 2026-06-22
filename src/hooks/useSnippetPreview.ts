import { useCallback, useState } from 'react';

import {
  getSnippetPreviewEnabled,
  setSnippetPreviewEnabled as persistSnippetPreviewEnabled,
} from '../services/snippetPreviewStore';

/**
 * React state for the snippet-preview preference, seeded once from the
 * persisted value (synchronous on every platform: native reads SQLite, web
 * reads the hydrated in-memory cache). Updating it both re-renders consumers
 * and persists the new value through the store.
 */
export function useSnippetPreview() {
  const [snippetPreviewEnabled, setEnabled] = useState<boolean>(
    getSnippetPreviewEnabled,
  );

  const setSnippetPreviewEnabled = useCallback((enabled: boolean) => {
    setEnabled(enabled);
    persistSnippetPreviewEnabled(enabled);
  }, []);

  return { snippetPreviewEnabled, setSnippetPreviewEnabled };
}

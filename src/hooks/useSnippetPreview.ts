import {
  getSnippetPreviewEnabled,
  setSnippetPreviewEnabled as persistSnippetPreviewEnabled,
} from '../services/snippetPreviewStore';
import { usePersistedSetting } from './usePersistedSetting';

const SNIPPET_PREVIEW_SETTING = {
  read: getSnippetPreviewEnabled,
  write: persistSnippetPreviewEnabled,
  // Mirrors the store's default so a storage failure lands on the same value an
  // unset preference would.
  fallback: true,
};

/**
 * React state for the snippet-preview preference: while a marker is dragged,
 * the engine plays a short rolling window around it. Seeded from storage and
 * kept there by {@link usePersistedSetting}, which owns the cold-load
 * re-read (#163) and the best-effort failure handling (#186).
 */
export function useSnippetPreview() {
  const [snippetPreviewEnabled, setSnippetPreviewEnabled] = usePersistedSetting(
    SNIPPET_PREVIEW_SETTING,
  );

  return { snippetPreviewEnabled, setSnippetPreviewEnabled };
}

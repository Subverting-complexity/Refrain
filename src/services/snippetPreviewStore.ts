import * as settingsStore from './settingsStore';

/**
 * Persisted global preference for the snippet preview: while a marker is being
 * dragged, the engine plays a short rolling window around it so the user can
 * hear where the marker sits. Defaults ON. Backed by the generic settings
 * store (the platform-resolved `settingsStore`/`settingsStore.web`), so it
 * survives reload and track changes exactly like the saved playback volume.
 */

const SNIPPET_PREVIEW_SETTING_KEY = 'snippetPreview.enabled';
const DEFAULT_SNIPPET_PREVIEW_ENABLED = true;

/** Whether the snippet preview is enabled. Defaults ON when unset. */
export function getSnippetPreviewEnabled(): boolean {
  return settingsStore.getBoolean(
    SNIPPET_PREVIEW_SETTING_KEY,
    DEFAULT_SNIPPET_PREVIEW_ENABLED,
  );
}

/** Persist whether the snippet preview is enabled. */
export function setSnippetPreviewEnabled(enabled: boolean): void {
  settingsStore.setBoolean(SNIPPET_PREVIEW_SETTING_KEY, enabled);
}

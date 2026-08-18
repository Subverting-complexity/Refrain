import * as settingsStore from './settingsStore';
import { ColorMode } from '../theme';

/**
 * Persisted appearance preference: whether the app follows the system scheme
 * or is pinned to light or dark. Backed by the generic settings store (the
 * platform-resolved `settingsStore`/`settingsStore.web`), so the choice
 * survives reload and relaunch exactly like the saved playback volume.
 *
 * Defaults to `system` when unset so a first launch tracks the OS scheme.
 */

const COLOR_MODE_SETTING_KEY = 'theme.colorMode';
const DEFAULT_COLOR_MODE: ColorMode = 'system';

const VALID_MODES: readonly ColorMode[] = ['system', 'light', 'dark'];

function isColorMode(value: string | null): value is ColorMode {
  return value !== null && (VALID_MODES as readonly string[]).includes(value);
}

/** The persisted color mode, or `system` when unset or corrupted. */
export function getColorMode(): ColorMode {
  const raw = settingsStore.getSetting(COLOR_MODE_SETTING_KEY);
  return isColorMode(raw) ? raw : DEFAULT_COLOR_MODE;
}

/** Persist the chosen color mode. */
export function setColorMode(mode: ColorMode): void {
  settingsStore.setSetting(COLOR_MODE_SETTING_KEY, mode);
}

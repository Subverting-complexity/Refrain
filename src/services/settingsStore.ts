import { getDatabase } from './database';
import { createTypedHelpers } from './settingsStore.shared';

interface SettingRow {
  value: string;
}

/**
 * Hydration is a web-only concern: the native store reads SQLite
 * synchronously, so the cache is always warm. This is a resolved no-op,
 * exported so cross-platform callers can `await settingsStore.hydrateSettings()`
 * before the first read without branching on platform — the web store
 * (`settingsStore.web`) overrides it with the real IndexedDB hydration.
 */
export function hydrateSettings(): Promise<void> {
  return Promise.resolve();
}

export function getSetting(key: string): string | null {
  const db = getDatabase();
  const row = db.getFirstSync<SettingRow>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export const { getNumber, setNumber, getBoolean, setBoolean } =
  createTypedHelpers({ getSetting, setSetting });

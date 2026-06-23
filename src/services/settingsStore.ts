import { getDatabase } from './database';

/**
 * Generic key-value settings store backed by the SQLite `settings` table.
 *
 * The same expo-sqlite database serves web (wasm backend) and native, so a
 * single implementation persists app preferences across reload and track
 * changes on every platform — no filesystem or platform split required.
 *
 * Values are stored as TEXT; typed helpers (`getNumber`/`setNumber`) wrap the
 * string round-trip for numeric settings such as playback volume.
 */

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

/**
 * Read a numeric setting. Returns `fallback` when the key is absent or the
 * stored text is not a finite number, so a corrupted row can never surface a
 * NaN to callers.
 */
export function getNumber(key: string, fallback: number): number {
  const raw = getSetting(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function setNumber(key: string, value: number): void {
  setSetting(key, String(value));
}

/**
 * Read a boolean setting. Stored as the text `'true'`/`'false'`; any other or
 * absent value returns `fallback`, so a missing or corrupted row falls back to
 * the caller's default rather than coercing to `false`.
 */
export function getBoolean(key: string, fallback: boolean): boolean {
  const raw = getSetting(key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

export function setBoolean(key: string, value: boolean): void {
  setSetting(key, value ? 'true' : 'false');
}

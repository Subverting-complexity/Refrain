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

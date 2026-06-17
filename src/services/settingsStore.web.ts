import { getAllStoredSettings, putStoredSetting } from './database.web';

/**
 * Web settings store.
 *
 * Native reads and writes settings synchronously, and callers (notably the
 * audio engine, which hydrates and persists volume on the synchronous playback
 * path) depend on that synchronous contract. On web persistence is async
 * (IndexedDB), so this module keeps the synchronous public API by serving
 * reads from an in-memory cache hydrated from IndexedDB once at startup. Writes
 * update the cache synchronously and persist in the background.
 *
 * Values are stored as strings; typed helpers (`getNumber`/`setNumber`) wrap
 * the string round-trip for numeric settings such as playback volume.
 */

const cache = new Map<string, string>();
let hydrationPromise: Promise<void> | null = null;

/**
 * Loads every settings record into the cache. Idempotent and best-effort: a
 * load failure leaves the cache empty so reads fall back to their defaults
 * rather than throwing. Kicked off eagerly at import so the cache is warm by
 * the time the player reads the persisted volume.
 */
export function hydrateSettings(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const rows = await getAllStoredSettings();
        for (const row of rows) {
          cache.set(row.key, row.value);
        }
      } catch {
        // Best-effort: leave the cache empty and let reads use defaults.
      }
    })();
  }
  return hydrationPromise;
}

void hydrateSettings();

export function getSetting(key: string): string | null {
  return cache.has(key) ? (cache.get(key) ?? null) : null;
}

export function setSetting(key: string, value: string): void {
  cache.set(key, value);
  void persistSetting(key, value);
}

async function persistSetting(key: string, value: string): Promise<void> {
  try {
    await putStoredSetting(key, value);
  } catch {
    // Persistence is best-effort; the cache already holds the new value.
  }
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

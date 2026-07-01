import { getAllStoredSettings, putStoredSetting } from './database.web';
import { createTypedHelpers } from './settingsStore.shared';

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

export const { getNumber, setNumber, getBoolean, setBoolean } =
  createTypedHelpers({ getSetting, setSetting });

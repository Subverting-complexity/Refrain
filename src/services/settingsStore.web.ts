import { getAllStoredSettings, putStoredSetting } from './database.web';
import { createTypedHelpers } from './settingsStore.shared';

const cache = new Map<string, string>();
let hydrationPromise: Promise<void> | null = null;

/**
 * Loads every settings record into the cache. Idempotent and best-effort: a
 * load failure leaves the cache empty so reads fall back to their defaults
 * rather than throwing. Kicked off eagerly at import so the cache is warm by
 * the time the player reads the persisted volume.
 *
 * A *failed* hydration is not cached. The read can fail for reasons that pass
 * — storage pressure, or another tab blocking an upgrade — and caching the
 * attempt would mean every later read fell back to its default for the rest
 * of the page session: the reader's theme, volume, skip interval and preview
 * setting would all silently revert, and changing them would appear to work
 * while reverting again on the next load. Native re-reads storage on every
 * call and so recovers on the next one; clearing the cached attempt gives web
 * the same second chance.
 */
export function hydrateSettings(): Promise<void> {
  if (!hydrationPromise) {
    // Boxed so the catch can identify its own attempt without a
    // self-referential const (the same shape `idb.web` uses).
    const box: { promise?: Promise<void> } = {};
    box.promise = (async () => {
      try {
        const rows = await getAllStoredSettings();
        for (const row of rows) {
          cache.set(row.key, row.value);
        }
      } catch {
        // Let the next call try again rather than serving defaults forever.
        if (hydrationPromise === box.promise) hydrationPromise = null;
      }
    })();
    hydrationPromise = box.promise;
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

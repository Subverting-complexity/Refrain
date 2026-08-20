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
    // self-referential const.
    const box: { promise?: Promise<void> } = {};
    // Deferred to a microtask so the body cannot run before the assignment
    // below. Inlining an async IIFE would look equivalent, but if the read
    // ever threw synchronously its catch would run first, find the box not
    // yet installed, and cache the failed attempt — the very thing this
    // guards against.
    box.promise = Promise.resolve().then(async () => {
      try {
        const rows = await getAllStoredSettings();
        for (const row of rows) {
          // Never overwrite a value this session already set. A retry can land
          // long after startup — every persisted-setting component hydrates on
          // mount — and if the write that followed the reader's change also
          // failed, the disk still holds the old value. Letting it win would
          // flip their theme back under them.
          if (!cache.has(row.key)) cache.set(row.key, row.value);
        }
      } catch {
        // Let the next call try again rather than serving defaults forever.
        if (hydrationPromise === box.promise) hydrationPromise = null;
      }
    });
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

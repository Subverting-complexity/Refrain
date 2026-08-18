import { useCallback, useEffect, useState } from 'react';

import { hydrateSettings } from '../services/settingsStore';
import { useLatestRef } from './useLatestRef';

export interface PersistedSetting<T> {
  /** Read the stored value. May throw — a storage failure is handled here. */
  read: () => T;
  /** Persist a new value. May throw — a storage failure is handled here. */
  write: (value: T) => void;
  /** Value to use when storage is unreachable at seed time. */
  fallback: T;
}

/**
 * Outcome of a guarded read. `ok` distinguishes "storage is unreachable" from
 * a real value; a `null`/`undefined` sentinel would not, because `T` may
 * itself be nullable.
 */
type ReadResult<T> = { ok: true; value: T } | { ok: false };

function safeRead<T>(read: () => T): ReadResult<T> {
  try {
    return { ok: true, value: read() };
  } catch {
    return { ok: false };
  }
}

/**
 * React state for a single persisted preference, seeded synchronously from
 * storage and re-read once settings hydration resolves.
 *
 * Hydration matters on a cold web load, where the settings cache is still
 * filling from IndexedDB when the lazy seed runs and a stored value reads as
 * the default (#163). Re-reading afterwards reapplies it. On native this is a
 * no-op: hydration is a resolved no-op and the seed was already correct.
 *
 * Every storage touch is best-effort — a failed read, hydration, or write
 * leaves the last usable value in place rather than throwing into a render or
 * an event handler (#186). Critically, a *failed* post-hydration read leaves
 * the seed alone: it has nothing to correct with, so overwriting a good seed
 * with the fallback would be the very clobber #163 was about.
 *
 * Returns a `[value, setValue]` pair, like `useState`.
 */
export function usePersistedSetting<T>(
  setting: PersistedSetting<T>,
): [T, (value: T) => void] {
  // Latched so the mount-only effect and the stable setter below always call
  // the current read/write without re-subscribing.
  const settingRef = useLatestRef(setting);

  // Seed in the lazy initializer so the first render already shows the stored
  // value (no default-then-update flash) and no setState runs in an effect.
  const [value, setValue] = useState<T>(() => {
    const result = safeRead(setting.read);
    return result.ok ? result.value : setting.fallback;
  });

  useEffect(() => {
    let cancelled = false;
    try {
      void Promise.resolve(hydrateSettings())
        .then(() => {
          if (cancelled) return;
          const result = safeRead(settingRef.current.read);
          if (result.ok) setValue(result.value);
        })
        .catch(() => undefined);
    } catch {
      // Best-effort: the lazy seed above already holds a usable value.
    }
    return () => {
      cancelled = true;
    };
  }, [settingRef]);

  const set = useCallback(
    (next: T) => {
      // Update in-memory state first so the UI responds even if the write
      // fails; persistence is best-effort and must not break the interaction.
      setValue(next);
      try {
        settingRef.current.write(next);
      } catch {
        // Swallowed by design — see the hook doc above.
      }
    },
    [settingRef],
  );

  return [value, set];
}

/**
 * Runs a platform-split store call and normalizes its result to a promise,
 * whether it fails synchronously or asynchronously.
 *
 * The stores under `src/services` are resolved per platform: the native
 * implementations are synchronous (expo-sqlite) and *throw* on failure, while
 * the web ones return promises and *reject*. Cross-platform callers therefore
 * had to guard both paths at every site — an outer `try` for the native throw
 * and a `.catch()` for the web rejection — with the same recovery duplicated
 * in each. `settle` funnels both into a single rejected promise, so one
 * `.catch()` covers every platform.
 *
 * ```ts
 * settle(() => updateProfile(id, region))
 *   .then(refresh)
 *   .catch(() => {}); // best-effort on both platforms
 * ```
 */
export function settle<T>(call: () => T | Promise<T>): Promise<T> {
  try {
    return Promise.resolve(call());
  } catch (error) {
    return Promise.reject(error);
  }
}

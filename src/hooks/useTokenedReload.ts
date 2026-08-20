import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useFocusEffect } from 'expo-router';

export interface UseTokenedReloadOptions<T> {
  /** Reads the screen's data. Its result is handed to `onLoaded`. */
  load: () => Promise<T>;
  /**
   * Applies a successful read. Only called for reads that are still current,
   * so it never has to check for staleness itself.
   */
  onLoaded: (data: T) => void;
  /** Reports a failure — normally a toast. Same staleness guarantee. */
  onError: (message: string) => void;
  /** Screen-reader announcement on a pull-to-refresh, e.g. 'Tracks refreshed'. */
  announcement: string;
  /** Toast text when the on-focus read fails. */
  loadFailureMessage: string;
  /** Toast text when a pull-to-refresh fails. */
  refreshFailureMessage: string;
}

export interface TokenedReload {
  /** True while a pull-to-refresh is in flight. */
  refreshing: boolean;
  /** Pull-to-refresh handler: reloads and announces the result. */
  handleRefresh: () => Promise<void>;
  /**
   * Reloads now. Resolves true when the data is current (or the read was
   * superseded, which is not a failure a caller should speak about), false
   * when the read failed and the error was reported.
   */
  reload: () => Promise<boolean>;
  /**
   * Retires every read still in flight. Call before an optimistic edit so a
   * slower read started beforehand cannot land on top of it.
   */
  invalidateLoads: () => void;
}

/**
 * The reload scaffolding both library screens need: read on focus, read on
 * pull-to-refresh, and a token that retires reads which are no longer wanted.
 *
 * The token exists because a read started before an edit holds a snapshot
 * that predates it; letting it land would silently undo the edit the reader
 * just made. It guards the failure path as well as the successful one — a
 * read that fails after the reader has moved on must no more raise an error
 * into whatever screen they are now looking at than a slow successful read
 * may overwrite it.
 *
 * The screen keeps its own `load` closure, which is the part that genuinely
 * differs; everything around it is identical between screens.
 */
export function useTokenedReload<T>({
  load,
  onLoaded,
  onError,
  announcement,
  loadFailureMessage,
  refreshFailureMessage,
}: UseTokenedReloadOptions<T>): TokenedReload {
  const [refreshing, setRefreshing] = useState(false);

  const loadToken = useRef(0);
  const invalidateLoads = useCallback(() => {
    loadToken.current += 1;
    return loadToken.current;
  }, []);

  const reloadData = useCallback(
    async (
      announceSuccess: boolean,
      failureMessage: string,
    ): Promise<boolean> => {
      const token = invalidateLoads();
      try {
        const data = await load();
        // A read the reader has moved on from reported nothing either way,
        // so it is not a failure a caller should speak about.
        if (loadToken.current !== token) return true;
        onLoaded(data);
        if (announceSuccess) {
          AccessibilityInfo.announceForAccessibility(announcement);
        }
        return true;
      } catch {
        if (loadToken.current !== token) return true;
        onError(failureMessage);
        return false;
      }
    },
    [invalidateLoads, load, onLoaded, onError, announcement],
  );

  const reload = useCallback(
    () => reloadData(false, loadFailureMessage),
    [reloadData, loadFailureMessage],
  );

  useFocusEffect(
    useCallback(() => {
      void reloadData(false, loadFailureMessage);
      // Leaving the screen retires the read in flight, so it cannot report
      // into the screen the reader moved on to.
      return () => {
        loadToken.current += 1;
      };
    }, [reloadData, loadFailureMessage]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reloadData(true, refreshFailureMessage);
    } finally {
      setRefreshing(false);
    }
  }, [reloadData, refreshFailureMessage]);

  const invalidate = useCallback(() => {
    invalidateLoads();
  }, [invalidateLoads]);

  return { refreshing, handleRefresh, reload, invalidateLoads: invalidate };
}

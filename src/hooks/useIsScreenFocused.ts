import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Whether this screen is the one the reader is currently looking at.
 *
 * Screens further down the navigation stack stay mounted, so "is this
 * component rendered" is not the same question as "is this the active
 * screen". Anything that must happen exactly once per app-wide event —
 * handling an incoming share, say — needs the second question answered.
 */
export function useIsScreenFocused(): boolean {
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return focused;
}

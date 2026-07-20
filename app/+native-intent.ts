import { getShareExtensionKey } from 'expo-share-intent';

/**
 * Expo Router native-intent hook. The iOS share extension re-opens the app
 * with a `refrain://dataUrl=refrainShareKey…` deep link; without this
 * redirect, expo-router would try to resolve that URL as a route. Send it to
 * the library screen instead — the `useShareIntent` hook mounted there reads
 * the shared payload from the native module, not from this URL.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return '/';
    }
    return path;
  } catch {
    // A failure here would leave the router pointed at an unroutable URL, so
    // fall back to the library screen.
    return '/';
  }
}

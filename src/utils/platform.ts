import { Platform } from 'react-native';

/**
 * True when running in mobile Safari / any iOS browser (all iOS browsers use
 * WebKit). These engines ignore programmatic `HTMLMediaElement.volume`
 * changes, so `expo-audio`'s web volume path silently no-ops there. Callers use
 * this to surface the limitation in the UI instead of presenting a slider
 * that appears to do nothing.
 *
 * Detection is intentionally conservative: it only returns true on web, and
 * relies on the user-agent. iPadOS 13+ reports a desktop UA but also exposes
 * touch points, which the `MacIntel + maxTouchPoints` check below catches.
 */
export function isIOSWeb(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;

  // iPadOS 13+ masquerades as macOS Safari; distinguish by touch support.
  const isTouchMac =
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;
  return isTouchMac;
}

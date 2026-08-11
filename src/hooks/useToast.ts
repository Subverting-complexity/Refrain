import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { ToastVariant } from '../components/Toast';

export interface ToastState {
  message: string;
  variant: ToastVariant;
}

export const TOAST_DURATION_MS = 4000;

export interface UseToastResult {
  toast: ToastState | null;
  showToast: (message: string, variant?: ToastVariant) => void;
  hideToast: () => void;
}

/**
 * Manages a single transient toast. The latest call to `showToast` replaces
 * any visible toast and resets the auto-dismiss timer. The timer is cleared
 * on manual dismiss and on unmount.
 *
 * `showToast` also announces the message to screen readers. The `Toast` banner
 * carries `accessibilityRole="alert"`, but that does not reliably announce on
 * appearance across platforms, so an explicit announcement is still needed.
 * Making it part of raising the toast — rather than something every caller
 * pairs by hand — is what keeps the spoken and visible text from drifting.
 */
export function useToast(
  durationMs: number = TOAST_DURATION_MS,
): UseToastResult {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      clearTimer();
      setToast({ message, variant });
      AccessibilityInfo.announceForAccessibility(message);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setToast(null);
      }, durationMs);
    },
    [clearTimer, durationMs],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast, hideToast };
}

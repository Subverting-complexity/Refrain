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
  /**
   * Raise an error toast. Identical to `showToast(message, 'error')`.
   *
   * This and `showSuccess` exist because the screens were spelling the
   * variant out positionally at every call site, where it is easy to read
   * past and easy to get wrong. `showError` is also directly usable as an
   * `onError` handler, which is what two screens were wrapping by hand.
   * `showToast` remains for the rare caller that picks its variant at
   * runtime.
   */
  showError: (message: string) => void;
  /** Raise a success toast. The counterpart to {@link UseToastResult.showError}. */
  showSuccess: (message: string) => void;
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

  const showError = useCallback(
    (message: string) => showToast(message, 'error'),
    [showToast],
  );

  const showSuccess = useCallback(
    (message: string) => showToast(message, 'success'),
    [showToast],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast, showError, showSuccess, hideToast };
}

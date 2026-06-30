import { useCallback, useEffect, useRef, useState } from 'react';

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

import { ViewStyle } from 'react-native';

import { ToastState } from '../hooks/useToast';
import { Toast } from './Toast';

interface ToastHostProps {
  /** The current toast from `useToast`, or `null` when none is showing. */
  toast: ToastState | null;
  onDismiss: () => void;
  style?: ViewStyle;
}

/**
 * Renders the toast owned by `useToast`. Screens pair the two, and unpacking
 * the state into `Toast`'s props at each site let the two screens drift — one
 * re-defaulted the variant to `success`, so an error toast raised without an
 * explicit variant rendered green there and red on the other (#179). Binding
 * hook to component once keeps that impossible: the only variant default now
 * lives in `useToast.showToast`.
 */
export function ToastHost({ toast, onDismiss, style }: ToastHostProps) {
  return (
    <Toast
      message={toast?.message ?? null}
      variant={toast?.variant}
      onDismiss={onDismiss}
      style={style}
    />
  );
}

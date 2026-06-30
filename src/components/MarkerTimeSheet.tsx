import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { MIN_TOUCH_TARGET, spacing } from '../theme';
import { formatDurationTenths } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';
import { BottomSheet } from './BottomSheet';

// Fine tier: precise tenth-of-a-second nudges.
const FINE_STEP_MS = 100;
const FINE_ACCELERATED_STEP_MS = 500;
// Coarse tier: whole-second jumps for covering distance quickly.
const COARSE_STEP_MS = 1000;
const COARSE_ACCELERATED_STEP_MS = 5000;
const HOLD_INITIAL_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 100;
// After this much hold time, each tier jumps to its accelerated step size.
const HOLD_ACCELERATE_AFTER_MS = 1500;

export interface MarkerTimeSheetProps {
  marker: 'A' | 'B';
  initialMs: number;
  durationMs: number;
  /** Called on every 100 ms step — the parent writes through to the engine in real time. */
  onCommit: (ms: number) => void;
  /** A tile: clear both markers. B tile: clear B only. Enforced by caller. */
  onRemove: () => void;
  onDismiss: () => void;
}

export function MarkerTimeSheet({
  marker,
  initialMs,
  durationMs,
  onCommit,
  onRemove,
  onDismiss,
}: MarkerTimeSheetProps) {
  const { theme } = useTheme();
  const [currentMs, setCurrentMs] = useState(initialMs);

  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdAccelerateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mutable step size; bumped by the acceleration timeout.
  const stepSizeRef = useRef(FINE_STEP_MS);
  // Tracks the live value so timer callbacks always read the latest without
  // relying on React state (which batches under act() in tests).
  const currentMsRef = useRef(initialMs);

  const clearHoldTimers = useCallback(() => {
    if (holdTimeoutRef.current != null) clearTimeout(holdTimeoutRef.current);
    if (holdIntervalRef.current != null) clearInterval(holdIntervalRef.current);
    if (holdAccelerateRef.current != null)
      clearTimeout(holdAccelerateRef.current);
    holdTimeoutRef.current = null;
    holdIntervalRef.current = null;
    holdAccelerateRef.current = null;
    stepSizeRef.current = FINE_STEP_MS;
  }, []);

  useEffect(() => () => clearHoldTimers(), [clearHoldTimers]);

  // Keep refs in sync with the latest props so timer callbacks are never stale.
  const durationMsRef = useRef(durationMs);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    durationMsRef.current = durationMs;
  }, [durationMs]);
  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Apply one step of `amountMs`: mutate the ref, update display state, notify
  // parent. Called both immediately on pressIn and on each timer tick, so
  // onCommit fires synchronously every time (not batched through useEffect).
  const applyStep = useCallback((direction: 1 | -1, amountMs: number) => {
    const next = Math.max(
      0,
      Math.min(
        durationMsRef.current,
        currentMsRef.current + direction * amountMs,
      ),
    );
    currentMsRef.current = next;
    setCurrentMs(next);
    onCommitRef.current(next);
  }, []);

  // Begin a press: apply one step now, then after a hold delay repeat the step
  // and eventually accelerate to the larger step size for the tier.
  const handlePressIn = useCallback(
    (direction: 1 | -1, baseStep: number, acceleratedStep: number) => {
      applyStep(direction, baseStep);
      stepSizeRef.current = baseStep;
      holdTimeoutRef.current = setTimeout(() => {
        holdIntervalRef.current = setInterval(() => {
          applyStep(direction, stepSizeRef.current);
        }, HOLD_REPEAT_INTERVAL_MS);
        holdAccelerateRef.current = setTimeout(() => {
          stepSizeRef.current = acceleratedStep;
        }, HOLD_ACCELERATE_AFTER_MS - HOLD_INITIAL_DELAY_MS);
      }, HOLD_INITIAL_DELAY_MS);
    },
    [applyStep],
  );

  const markerLabel = marker === 'A' ? 'Loop start' : 'Loop end';
  const removeLabel =
    marker === 'A' ? 'Remove loop start and end' : 'Remove loop end';

  return (
    <BottomSheet
      title={markerLabel}
      onClose={onDismiss}
      closeLabel="Close marker editor"
    >
      <View style={styles.body}>
        <View style={styles.stepper}>
          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${markerLabel.toLowerCase()} by 100 milliseconds`}
            onPressIn={() =>
              handlePressIn(-1, FINE_STEP_MS, FINE_ACCELERATED_STEP_MS)
            }
            onPressOut={clearHoldTimers}
            style={(p) => [
              styles.stepButton,
              {
                borderColor: theme.colors.border,
                opacity: p.pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons
              name="remove"
              size={32}
              color={theme.colors.textPrimary}
            />
          </AccessiblePressable>

          <Text
            style={[styles.timeDisplay, { color: theme.colors.textPrimary }]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${markerLabel}: ${formatDurationTenths(currentMs)}`}
          >
            {formatDurationTenths(currentMs)}
          </Text>

          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${markerLabel.toLowerCase()} by 100 milliseconds`}
            onPressIn={() =>
              handlePressIn(1, FINE_STEP_MS, FINE_ACCELERATED_STEP_MS)
            }
            onPressOut={clearHoldTimers}
            style={(p) => [
              styles.stepButton,
              {
                borderColor: theme.colors.border,
                opacity: p.pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons name="add" size={32} color={theme.colors.textPrimary} />
          </AccessiblePressable>
        </View>

        <View style={styles.coarseRow}>
          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${markerLabel.toLowerCase()} by 1 second`}
            onPressIn={() =>
              handlePressIn(-1, COARSE_STEP_MS, COARSE_ACCELERATED_STEP_MS)
            }
            onPressOut={clearHoldTimers}
            style={(p) => [
              styles.coarseButton,
              {
                borderColor: theme.colors.border,
                opacity: p.pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons
              name="remove"
              size={16}
              color={theme.colors.textSecondary}
            />
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.textPrimary },
              ]}
            >
              1s
            </Text>
          </AccessiblePressable>

          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${markerLabel.toLowerCase()} by 1 second`}
            onPressIn={() =>
              handlePressIn(1, COARSE_STEP_MS, COARSE_ACCELERATED_STEP_MS)
            }
            onPressOut={clearHoldTimers}
            style={(p) => [
              styles.coarseButton,
              {
                borderColor: theme.colors.border,
                opacity: p.pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons name="add" size={16} color={theme.colors.textSecondary} />
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.textPrimary },
              ]}
            >
              1s
            </Text>
          </AccessiblePressable>
        </View>

        <View
          style={[styles.divider, { backgroundColor: theme.colors.border }]}
        />

        <AccessiblePressable
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          onPress={onRemove}
          style={(p) => [styles.removeButton, { opacity: p.pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
          <Text style={[theme.typography.body, { color: theme.colors.error }]}>
            {removeLabel}
          </Text>
        </AccessiblePressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  stepButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeDisplay: {
    fontSize: 36,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    minWidth: 116,
    textAlign: 'center',
  },
  coarseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  coarseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minWidth: 88,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: MIN_TOUCH_TARGET / 2,
    borderWidth: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
});

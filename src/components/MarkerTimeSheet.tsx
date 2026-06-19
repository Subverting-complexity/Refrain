import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { formatDurationTenths } from '../utils/formatTime';
import { AccessiblePressable } from './AccessiblePressable';

const STEP_MS = 100;
const HOLD_INITIAL_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 100;
const HOLD_ACCELERATED_STEP_MS = 500;
// After this much hold time, steps jump from 100 ms to 500 ms.
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
  const stepSizeRef = useRef(STEP_MS);
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
    stepSizeRef.current = STEP_MS;
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

  // Apply one step: mutate the ref, update display state, notify parent.
  // Called both immediately on pressIn and on each timer tick, so onCommit
  // fires synchronously every time (not batched through useEffect).
  const applyStep = useCallback((direction: 1 | -1) => {
    const next = Math.max(
      0,
      Math.min(
        durationMsRef.current,
        currentMsRef.current + direction * stepSizeRef.current,
      ),
    );
    currentMsRef.current = next;
    setCurrentMs(next);
    onCommitRef.current(next);
  }, []);

  const handlePressIn = useCallback(
    (direction: 1 | -1) => {
      applyStep(direction);
      stepSizeRef.current = STEP_MS;
      holdTimeoutRef.current = setTimeout(() => {
        holdIntervalRef.current = setInterval(() => {
          applyStep(direction);
        }, HOLD_REPEAT_INTERVAL_MS);
        holdAccelerateRef.current = setTimeout(() => {
          stepSizeRef.current = HOLD_ACCELERATED_STEP_MS;
        }, HOLD_ACCELERATE_AFTER_MS - HOLD_INITIAL_DELAY_MS);
      }, HOLD_INITIAL_DELAY_MS);
    },
    [applyStep],
  );

  const markerLabel = marker === 'A' ? 'Loop start' : 'Loop end';
  const removeLabel =
    marker === 'A' ? 'Remove loop start and end' : 'Remove loop end';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <AccessiblePressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Close marker editor"
          onPress={onDismiss}
        />

        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.header}>
            <Text
              style={[
                theme.typography.heading,
                { color: theme.colors.textPrimary },
              ]}
            >
              {markerLabel}
            </Text>
            <AccessiblePressable
              accessibilityRole="button"
              accessibilityLabel="Close marker editor"
              onPress={onDismiss}
            >
              <Ionicons
                name="close"
                size={24}
                color={theme.colors.textSecondary}
              />
            </AccessiblePressable>
          </View>

          <View style={styles.stepper}>
            <AccessiblePressable
              accessibilityRole="button"
              accessibilityLabel={`Decrease ${markerLabel.toLowerCase()} by 100 milliseconds`}
              onPressIn={() => handlePressIn(-1)}
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
              onPressIn={() => handlePressIn(1)}
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

          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />

          <AccessiblePressable
            accessibilityRole="button"
            accessibilityLabel={removeLabel}
            onPress={onRemove}
            style={(p) => [
              styles.removeButton,
              { opacity: p.pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={18}
              color={theme.colors.error}
            />
            <Text
              style={[theme.typography.body, { color: theme.colors.error }]}
            >
              {removeLabel}
            </Text>
          </AccessiblePressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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

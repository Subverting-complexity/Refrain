import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { AccessiblePressable } from './AccessiblePressable';

interface SnippetPreviewSettingsProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  style?: ViewStyle;
}

// Visual switch geometry. A full-pill track with a large knob that nearly
// fills its height reads as a modern toggle; the thumb travels the gap between
// the two end insets. Kept as constants so the travel distance stays in sync if
// the dimensions change.
const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const THUMB_SIZE = 26;
const THUMB_INSET = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

/**
 * Inline toggle card for the snippet preview, sitting alongside the count-in
 * settings on the player. When on, dragging an A/B marker auditions a short
 * rolling snippet around it; when off, dragging just moves the marker.
 *
 * The switch keeps its 44pt minimum touch target via `AccessiblePressable`
 * while rendering the pill as an inner view, so the hit area never inflates the
 * visual track into a square. The thumb slides and the track recolors on toggle.
 */
export function SnippetPreviewSettings({
  enabled,
  onChange,
  style,
}: SnippetPreviewSettingsProps) {
  const { theme } = useTheme();

  // Drives both the thumb slide and the track recolor from a single 0→1 value.
  // backgroundColor interpolation rules out the native driver, which is fine
  // for a control this small.
  const progress = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: enabled ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [enabled, progress]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.border, theme.colors.accent],
  });
  const thumbColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.textSecondary, theme.colors.accentText],
  });
  const thumbTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [THUMB_INSET, THUMB_INSET + THUMB_TRAVEL],
  });

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLabel}>
          <Ionicons
            name="headset-outline"
            size={18}
            color={theme.colors.accent}
          />
          <Text
            style={[theme.typography.body, { color: theme.colors.textPrimary }]}
          >
            Snippet preview
          </Text>
        </View>

        <AccessiblePressable
          accessibilityRole="switch"
          accessibilityLabel={`Snippet preview ${enabled ? 'on' : 'off'}`}
          accessibilityState={{ checked: enabled }}
          onPress={() => onChange(!enabled)}
        >
          <Animated.View
            style={[styles.track, { backgroundColor: trackColor }]}
          >
            <Animated.View
              style={[
                styles.thumb,
                {
                  backgroundColor: thumbColor,
                  transform: [{ translateX: thumbTranslate }],
                },
              ]}
            />
          </Animated.View>
        </AccessiblePressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  headerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    // A soft lift so the knob reads as floating above the track.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
});

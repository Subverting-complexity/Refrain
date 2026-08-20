import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';

export interface PlayerErrorBannerProps {
  /** The headline shown beside the alert icon, in the error color. */
  message: string;
  /** Supporting caption under the headline. Omitted when empty. */
  detail?: string | null;
  /**
   * Clamps the detail text. Fixed guidance strings fit without it; a raw
   * error message can be arbitrarily long, so its caller clamps.
   */
  detailNumberOfLines?: number;
  style?: ViewStyle;
}

/**
 * The player screen's inline error strip: an alert icon with a one-line
 * headline, and an optional caption underneath. Used for both "track is
 * gone from the library" and "track failed to load".
 */
export function PlayerErrorBanner({
  message,
  detail,
  detailNumberOfLines,
  style,
}: PlayerErrorBannerProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.banner, style]}>
      <View style={styles.headline}>
        <Ionicons name="alert-circle" size={20} color={theme.colors.error} />
        <Text style={[theme.typography.body, { color: theme.colors.error }]}>
          {message}
        </Text>
      </View>
      {detail ? (
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textSecondary },
          ]}
          numberOfLines={detailNumberOfLines}
          ellipsizeMode={detailNumberOfLines ? 'tail' : undefined}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});

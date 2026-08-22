import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { IconSquareButton } from './IconSquareButton';

/** Stable handle for end-to-end tests to target the back button. */
export const HEADER_BACK_BUTTON_TEST_ID = 'header-back-button';

/**
 * Icon-only back button for stack headers.
 *
 * The platform's own back button is labelled with the previous screen's
 * title, so its width changes from screen to screen, and where the
 * previous screen has no title it falls back to the raw route name. This
 * replaces it with a fixed square carrying only a chevron.
 *
 * It reuses `IconSquareButton`, the bordered square this app already uses
 * for icon actions, so the back button is drawn from the same set as the
 * rest of the app rather than in a style of its own.
 *
 * Render it only where there is somewhere to go back to — the `headerLeft`
 * option in `app/_layout.tsx` gates it on the navigator's own `canGoBack`.
 */
export function HeaderBackButton() {
  const router = useRouter();

  // Guard at press time as well: unlike the platform button, this one is
  // not disabled during the pop transition, so a fast double tap would
  // otherwise pop two screens.
  const handlePress = () => {
    if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <IconSquareButton
        icon="chevron-back"
        accessibilityLabel="Go back"
        onPress={handlePress}
        testID={HEADER_BACK_BUTTON_TEST_ID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Android lays a custom header-left element and the title out in one
    // row with no gap between them, so the title would sit flush against
    // the button. iOS and web space bar items themselves.
    marginRight: Platform.OS === 'android' ? spacing.md : 0,
  },
});

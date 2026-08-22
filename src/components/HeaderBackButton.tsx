import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { IconSquareButton } from './IconSquareButton';

/** Stable handle for tests to target the back button. */
export const HEADER_BACK_BUTTON_TEST_ID = 'header-back-button';

/**
 * Icon-only back button for stack headers.
 *
 * On iOS and web the platform's own back button is labelled with the
 * previous screen's title, so its width changes from screen to screen,
 * and where the previous screen has no title it falls back to the raw
 * route name. (Android's is already icon-only.) This replaces all of them
 * with one fixed square carrying a chevron.
 *
 * It reuses `IconSquareButton`, the bordered square this app already uses
 * for icon actions, rather than introducing another button style.
 *
 * Render it only where there is somewhere to go back to — the `headerLeft`
 * option in `app/_layout.tsx` gates it on the navigator's own `canGoBack`.
 */
export function HeaderBackButton() {
  const router = useRouter();
  const popping = useRef(false);

  // A popped screen unmounts, so the latch below normally resets by
  // itself. Clear it on focus as well, so a press that never resulted in
  // a pop cannot leave the button permanently dead.
  useFocusEffect(
    useCallback(() => {
      popping.current = false;
    }, []),
  );

  const handlePress = () => {
    // `router.back()` only adds a GO_BACK action to expo-router's routing
    // queue, which is dispatched later in an effect — and the queue does
    // not deduplicate. So a second press before that flush queues a
    // second pop and takes two screens off the stack. The platform back
    // button disables itself during the transition; this one has to latch
    // instead, because `canGoBack()` still reads true mid-stack.
    if (popping.current || !router.canGoBack()) {
      return;
    }
    popping.current = true;
    router.back();
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
    // the button. iOS and web space bar items themselves. `marginEnd`
    // rather than `marginRight` so it follows the writing direction.
    marginEnd: Platform.OS === 'android' ? spacing.md : 0,
  },
});

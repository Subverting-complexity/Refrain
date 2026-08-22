import { useRouter } from 'expo-router';
import type {
  NativeStackHeaderBackProps,
  NativeStackHeaderItem,
  NativeStackHeaderItemProps,
  NativeStackNavigationOptions,
} from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { IconSquareButton } from './IconSquareButton';

/** Stable handle for tests to target the back button. */
export const HEADER_BACK_BUTTON_TEST_ID = 'header-back-button';

/**
 * How long a press suppresses the next one. Long enough to cover the
 * queue flush and pop transition that a double tap races, short enough
 * that it is imperceptible if the pop turns out to be blocked.
 */
export const POP_GUARD_MS = 500;

/**
 * Icon-only back button for stack headers.
 *
 * On iOS and web the platform's own back button is labelled with the
 * previous screen's title, so its width changes from screen to screen,
 * and where the previous screen has no title it falls back to the raw
 * route name. (Android's is already icon-only.) This replaces all of them
 * with one fixed square carrying a chevron.
 *
 * It reuses `IconSquareButton`, the square this app already uses for icon
 * actions, rather than introducing another button style — in its `ghost`
 * variant, so the chevron sits in the header bar as a peer of the title
 * rather than as a filled tile floating in it.
 *
 * Render it only where there is somewhere to go back to — the `headerLeft`
 * option in `app/_layout.tsx` gates it on the navigator's own `canGoBack`.
 */
export function HeaderBackButton() {
  const router = useRouter();
  const popping = useRef(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (releaseTimer.current) {
        clearTimeout(releaseTimer.current);
      }
    };
  }, []);

  const handlePress = () => {
    // `router.back()` does not pop: it appends a GO_BACK action to
    // expo-router's routing queue, which is flushed later from an effect
    // and does not deduplicate. A second press before that flush queues a
    // second pop and takes two screens off the stack, because
    // `canGoBack()` still reads true mid-stack. The platform back button
    // gets this for free by disabling itself for the transition; this one
    // has to latch.
    if (popping.current || !router.canGoBack()) {
      return;
    }
    popping.current = true;

    // Release on a timer rather than on regaining focus. A pop can be
    // cancelled without the screen ever blurring — the player's
    // unsaved-edits guard calls `preventDefault()` on `beforeRemove` and
    // shows a dialog in the same route — and a focus-based release would
    // never fire there, leaving the button dead for the life of the
    // screen. A pop that does succeed unmounts this component, and the
    // effect above clears the pending timer.
    releaseTimer.current = setTimeout(() => {
      popping.current = false;
      releaseTimer.current = null;
    }, POP_GUARD_MS);

    router.back();
  };

  return (
    <View style={styles.container}>
      <IconSquareButton
        icon="chevron-back"
        variant="ghost"
        accessibilityLabel="Go back"
        onPress={handlePress}
        testID={HEADER_BACK_BUTTON_TEST_ID}
      />
    </View>
  );
}

/**
 * Stack `screenOptions` that put {@link HeaderBackButton} in the header.
 *
 * The button has to reach the header by a different option on iOS. From
 * iOS 26, UIKit draws a shared background capsule behind the items in a
 * navigation bar, and a custom `headerLeft` view is wrapped in one like
 * any other bar button item. Over this app's dark header that capsule
 * paints as a solid light blob with the chevron all but invisible inside
 * it. `UIBarButtonItem.hidesSharedBackground` turns the capsule off, and
 * `unstable_headerLeftItems` is the only option expo-router routes
 * through to it, so on iOS the button goes in as a custom header item
 * with that flag set.
 *
 * Android and web have no shared background and ignore
 * `unstable_headerLeftItems` entirely, so they keep the plain
 * `headerLeft`. The key is left out on those platforms rather than set
 * everywhere, because the web header spreads the options it does not
 * recognise onto its own header element.
 *
 * Both forms gate on the navigator's own `canGoBack`, so a screen with
 * nothing beneath it gets no header-left element at all. Note the two
 * gates return different empty values: `headerLeft` has to return a real
 * `null`, because a component that renders null still creates a
 * header-left view and on Android that displaces the title out of the
 * native toolbar, while `unstable_headerLeftItems` returns an empty list.
 */
export function headerBackButtonOptions(): NativeStackNavigationOptions {
  if (Platform.OS === 'ios') {
    return {
      unstable_headerLeftItems: ({
        canGoBack,
      }: NativeStackHeaderItemProps): NativeStackHeaderItem[] =>
        canGoBack
          ? [
              {
                type: 'custom',
                element: <HeaderBackButton />,
                hidesSharedBackground: true,
              },
            ]
          : [],
    };
  }

  return {
    headerLeft: ({ canGoBack }: NativeStackHeaderBackProps) =>
      canGoBack ? <HeaderBackButton /> : null,
  };
}

const styles = StyleSheet.create({
  container: {
    // Android lays a custom header-left element and the title out in one
    // row with no gap between them, so the title would sit flush against
    // the button. iOS and web space bar items themselves.
    marginRight: Platform.OS === 'android' ? spacing.md : 0,
  },
});

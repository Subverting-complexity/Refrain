import { useRouter } from 'expo-router';

import { IconSquareButton } from './IconSquareButton';

interface HeaderBackButtonProps {
  /** Overrides the default "Go back" screen-reader label. */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Icon-only back button for stack headers.
 *
 * The platform default renders as a pill carrying the previous screen's
 * title, which sits outside the app's palette and changes width with
 * whatever that title happens to be. This reuses `IconSquareButton` — the
 * same control as the Settings button on the opposite header corner — so
 * both corners read as one set, and the button stays a fixed square
 * whatever screen it returns to.
 *
 * Renders nothing when there is no screen underneath, so it can be set
 * once on a navigator's `screenOptions` without putting a dead button on
 * a root screen.
 */
export function HeaderBackButton({
  accessibilityLabel = 'Go back',
  testID,
}: HeaderBackButtonProps) {
  const router = useRouter();

  if (!router.canGoBack()) {
    return null;
  }

  return (
    <IconSquareButton
      icon="chevron-back"
      accessibilityLabel={accessibilityLabel}
      onPress={() => router.back()}
      testID={testID}
    />
  );
}

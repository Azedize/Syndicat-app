import { useRouter, useLocalSearchParams } from "expo-router";

/**
 * Resolves where the back button/gesture should take the user.
 *
 * Some screens can be entered from more than one place (e.g. a dashboard
 * quick-action AND the "Plus" menu). Because these detail screens live
 * outside the `(tabs)` group, `router.back()` on its own can lose track of
 * which tab was active and fall back to the Dashboard tab instead of the
 * tab the user actually came from (e.g. "Plus").
 *
 * The fix: whoever navigates to the screen passes a `from` route param
 * (see `app/(tabs)/more.tsx`). If present, back navigation replaces to that
 * exact route instead of relying on the underlying stack/tabs history.
 */
export function useBackNavigation() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();

  return () => {
    if (from) {
      router.replace(from as any);
    } else {
      router.back();
    }
  };
}

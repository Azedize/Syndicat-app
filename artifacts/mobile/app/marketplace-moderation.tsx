/**
 * Legacy route — redirects to the canonical /admin/marketplace screen.
 * Kept for backwards compatibility with any deep-links or push() calls
 * that still reference /marketplace-moderation.
 */
import { Redirect } from "expo-router";

export default function MarketplaceModerationRedirect() {
  return <Redirect href={"/admin/marketplace" as any} />;
}

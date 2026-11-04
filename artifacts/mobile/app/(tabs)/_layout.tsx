import { Tabs } from "expo-router";
import React from "react";

import { GlassTabBar } from "@/components/navigation/GlassTabBar";
import { useLanguage } from "@/context/LanguageContext";
import { useRole } from "@/hooks/usePermission";

export default function TabLayout() {
  const { isSuperAdmin, isSyndicateAdmin, isTreasurer, isPresident, isAdmin, role } = useRole();
  const { t } = useLanguage();
  const hiddenTabStyle = { display: "none" as const };

  // Finance tab: Syndicate Admin has full access; Treasurer manages finances.
  // President gets read-only budget access via this tab.
  // Secretary/CommitteeMember/Member access finance via the More menu.
  const showFinanceTab = isSyndicateAdmin || isTreasurer || isPresident;

  // Members tab: Super Admin (platform list of syndicates) + Syndicate Admin (members list).
  // President/Secretary/CommitteeMember access member info via governance screens.
  const showMembersTab = isAdmin;

  // Members are buyers in the marketplace — they need to browse and purchase.
  // Tenants can also browse and purchase from the marketplace.
  // Syndicate Admin manages the marketplace (seller).
  const showMarketplaceTab = isSyndicateAdmin || role === "member" || role === "tenant";

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: "fade" }}
    >
      {/* Dashboard — all roles */}
      <Tabs.Screen name="index" options={{ title: t("tabHome") }} />

      {/* Members / Syndicats — super_admin sees platform list; syndicate_admin sees members */}
      <Tabs.Screen
        name="members"
        options={{
          title: isSuperAdmin ? t("syndicates") : t("members"),
          tabBarItemStyle: showMembersTab ? undefined : hiddenTabStyle,
        }}
      />

      {/* Finance — Syndicate Admin (full) + Treasurer (financial management only).
          Super Admin uses Tableau National. President/Secretary/Member access
          relevant finance items via More menu. */}
      <Tabs.Screen
        name="finance"
        options={{
          title: t("finance"),
          tabBarItemStyle: showFinanceTab ? undefined : hiddenTabStyle,
        }}
      />

      {/* Marketplace — Syndicate Admin only. */}
      <Tabs.Screen
        name="marketplace"
        options={{
          title: t("marketplace"),
          tabBarItemStyle: showMarketplaceTab ? undefined : hiddenTabStyle,
        }}
      />

      {/* More — all roles (content gated per role inside the screen) */}
      <Tabs.Screen name="more" options={{ title: t("more") }} />
    </Tabs>
  );
}

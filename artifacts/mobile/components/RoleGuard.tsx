/**
 * RoleGuard — screen-level RBAC enforcement.
 *
 * Menu/tab visibility alone is not access control: any user can reach a
 * screen by deep link or router.push if they know (or guess) the route.
 * Wrap the body of any screen that shows role-restricted data with this
 * component so unauthorized roles are redirected instead of rendering
 * (or erroring against) data they shouldn't see.
 *
 * Usage:
 *   export default function BudgetScreen() {
 *     return (
 *       <RoleGuard allow={["super_admin", "syndicate_admin"]}>
 *         ...screen content...
 *       </RoleGuard>
 *     );
 *   }
 */

import { router } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface RoleGuardProps {
  allow: UserRole[];
  children: React.ReactNode;
  /** Where to send unauthorized users. Defaults to the dashboard. */
  redirectTo?: string;
}

export default function RoleGuard({ allow, children, redirectTo = "/" }: RoleGuardProps) {
  const { user } = useAuth();
  const colors = useColors();
  const authorized = !!user && allow.includes(user.role);

  useEffect(() => {
    if (user && !authorized) {
      router.replace(redirectTo as any);
    }
  }, [user, authorized, redirectTo]);

  if (!user || !authorized) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

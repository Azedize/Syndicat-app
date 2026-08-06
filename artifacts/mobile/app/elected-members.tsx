import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, Alert, FlatList, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { elections as electionsApi } from "@/services/api";
import { ErrorState, LoadingState } from "@/components/DataState";

interface Mandate {
  id: string;
  userId: string | null;
  role: string;
  name: string;
  email: string | null;
  phone: string | null;
  mandateStart: string | null;
  mandateEnd: string | null;
  status: "active" | "expired" | "resigned" | "revoked";
}

export default function ElectedMembersScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin", "member"]}>
      <ElectedMembersInner />
    </RoleGuard>
  );
}

function ElectedMembersInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const queryClient = useQueryClient();
  // President and secretary manage elected member mandates and delegations.
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "president" || user?.role === "secretary";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mandates"],
    queryFn: () => electionsApi.mandates() as Promise<{ data: Mandate[] }>,
  });

  const resignMutation = useMutation({
    mutationFn: (id: string) => electionsApi.resignMandate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mandates"] }),
    onError: () => Alert.alert(t("elections"), t("electionActionFailed")),
  });

  const mandates = (data?.data ?? []).filter((m) => m.status === "active" || m.status === "resigned");
  const roleLabel = (role: string) => ({
    president: t("mandateRolePresident"),
    vice_president: t("mandateRoleVicePresident"),
    secretary: t("mandateRoleSecretary"),
    treasurer: t("mandateRoleTreasurer"),
    committee_member: t("mandateRoleCommitteeMember"),
    building_representative: t("mandateRoleBuildingRepresentative"),
    member: t("mandateRoleMember"),
  }[role] ?? role);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("electedMembers")}</Text>
      </View>

      {isLoading ? (
        <LoadingState title={t("electedMembers")} description={t("mandatesLoadDescription")} />
      ) : isError ? (
        <ErrorState
          title={t("electedMembers")}
          description={t("mandatesUnavailableDescription")}
          retryLabel={t("retry")}
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={mandates}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="award" size={40} color={colors.mutedForeground} />
              <Text style={[styles.centerText, { color: colors.mutedForeground }]}>{t("noElectedMembers")}</Text>
            </View>
          }
          renderItem={({ item: m }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: m.status === "active" ? colors.success + "20" : colors.muted }]}>
                <Feather name="award" size={20} color={m.status === "active" ? colors.success : colors.mutedForeground} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.name, { color: colors.foreground }]}>{m.name}</Text>
                <Text style={[styles.role, { color: colors.mutedForeground }]}>{roleLabel(m.role)}</Text>
                {m.mandateStart ? <Text style={[styles.date, { color: colors.mutedForeground }]}>{t("mandateActive")}: {m.mandateStart}</Text> : null}
              </View>
              {m.status === "resigned" ? (
                <Text style={[styles.badge, { color: colors.destructive }]}>{t("mandateResigned")}</Text>
              ) : (isAdmin || m.userId === user?.id) ? (
                <TouchableOpacity
                  style={[styles.resignBtn, { backgroundColor: colors.destructive + "15" }]}
                  onPress={() =>
                    Alert.alert(t("resignMandate"), m.name, [
                      { text: t("electionClosed"), style: "cancel" },
                      { text: t("resignMandate"), style: "destructive", onPress: () => resignMutation.mutate(m.id) },
                    ])
                  }
                >
                  <Text style={{ color: colors.destructive, fontSize: 11, fontWeight: "700" }}>{t("resignMandate")}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.badge, { color: colors.success }]}>{t("mandateActive")}</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  centerText: { fontSize: 15, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "700" },
  role: { fontSize: 12 },
  date: { fontSize: 11 },
  badge: { fontSize: 11, fontWeight: "700" },
  resignBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
});

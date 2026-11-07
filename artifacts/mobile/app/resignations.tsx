import { Feather } from "@/components/ui/Feather";
import React from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState, LoadingState } from "@/components/DataState";
import { askChoice } from "@/components/ui/TextPrompt";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { elections as electionsApi, meetings as meetingsApi, resignations as resignationsApi, type ApiResignation, type HandoverKey } from "@/features/governance/api";

/**
 * Resignation of the syndic or the syndic adjoint (Loi 18-00, art. 26 ter, 27,
 * 27 ter): every co-owner sees the deadline of the general assembly and who
 * acts meanwhile; the people involved tick the handover, record the assembly
 * and close the resignation once a successor is designated.
 */
export default function ResignationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isSyndicAdmin = user?.role === "syndicate_admin" || user?.role === "super_admin";

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({ queryKey: ["resignations"], queryFn: () => resignationsApi.list() });
  const { data: mandates } = useQuery({ queryKey: ["mandates"], queryFn: () => electionsApi.mandates() as Promise<{ data: { id: string; userId: string | null; role: string; name: string; status: string }[] }> });

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["resignations"] });
    queryClient.invalidateQueries({ queryKey: ["mandates"] });
  };
  const fail = (err: any) => showToast({ type: "error", title: t("resignationsTitle"), message: err?.message || t("electionActionFailed") });
  const handover = useMutation({ mutationFn: (v: { id: string; key: HandoverKey; done: boolean }) => resignationsApi.handover(v.id, { [v.key]: v.done }), onSuccess: done, onError: fail });
  const assembly = useMutation({
    mutationFn: (v: { id: string; meetingId: string }) => resignationsApi.assembly(v.id, v.meetingId),
    onSuccess: (r) => {
      done();
      if (r.warning) showToast({ type: "warning", message: r.warning.message });
    },
    onError: fail,
  });
  const close = useMutation({ mutationFn: (v: { id: string; body: { successorMandateId: string } | { noSuccessor: true } }) => resignationsApi.close(v.id, v.body), onSuccess: done, onError: fail });

  const roleLabel = (role: string) => (role === "syndic" ? t("mandateRoleSyndic") : role === "vice_syndic" ? t("mandateRoleViceSyndic") : role);
  const date = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-MA" : lang, { day: "numeric", month: "long", year: "numeric" }) : "—");
  const ITEMS: { key: HandoverKey; label: string }[] = [
    { key: "documents", label: t("handoverDocuments") },
    { key: "archives", label: t("handoverArchives") },
    { key: "registers", label: t("handoverRegisters") },
    { key: "treasury", label: t("handoverTreasury") },
    { key: "assets", label: t("handoverAssets") },
    { key: "cash", label: t("handoverCash") },
  ];
  /** The resigning person, the acting adjoint or the syndic administrator. */
  const canManage = (r: ApiResignation) =>
    isSyndicAdmin || r.userId === user?.id || (!!r.interimMandateId && (mandates?.data ?? []).some((m) => m.id === r.interimMandateId && m.userId === user?.id));

  const pickAssembly = async (r: ApiResignation) => {
    const list = ((await meetingsApi.list()).data ?? []) as { id: string; title: string; date: string; status: string }[];
    const usable = list.filter((m) => m.status !== "cancelled");
    if (!usable.length) return showToast({ type: "info", message: t("resignationNoAssembly") });
    const id = await askChoice({ title: t("resignationPickAssembly"), choices: usable.map((m) => ({ label: `${m.title} — ${date(m.date)}`, value: m.id })) });
    if (id) assembly.mutate({ id: r.id, meetingId: id });
  };
  const pickSuccessor = async (r: ApiResignation) => {
    const options = (mandates?.data ?? []).filter((m) => m.role === r.role && m.status === "active" && m.id !== r.mandate?.id);
    if (!options.length) return showToast({ type: "info", message: t("resignationNoCandidateSuccessor") });
    const id = await askChoice({ title: t("resignationClose"), choices: options.map((m) => ({ label: m.name, value: m.id })) });
    if (id) close.mutate({ id: r.id, body: { successorMandateId: id } });
  };

  const busy = handover.isPending || assembly.isPending || close.isPending;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("resignationsTitle")} />
      {isLoading ? (
        <LoadingState title={t("resignationsTitle")} />
      ) : isError ? (
        <ErrorState title={t("resignationsTitle")} description={t("electionActionFailed")} retryLabel={t("retry")} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={data?.data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="user-check" size={40} color={colors.mutedForeground} />
              <Text style={[styles.centerText, { color: colors.mutedForeground }]}>{t("resignationsEmpty")}</Text>
            </View>
          }
          renderItem={({ item: r }) => {
            const open = r.status === "open";
            const manage = open && canManage(r);
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: (open ? colors.warning : colors.success) + "20" }]}>
                    <Feather name={open ? "log-out" : "check-circle"} size={18} color={open ? colors.warning : colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.foreground }]}>{r.mandate?.name ?? "—"}</Text>
                    <Text style={[styles.sub, { color: colors.mutedForeground }]}>{roleLabel(r.role)} · {t("resignationNotified")} {date(r.notifiedAt)}</Text>
                  </View>
                  <Text style={[styles.badge, { color: open ? colors.warning : colors.success }]}>{open ? t("resignationOpen") : t("resignationClosed")}</Text>
                </View>

                {open ? (
                  <View style={[styles.box, { backgroundColor: (r.assemblyOverdue ? colors.destructive : colors.primary) + "12" }]} accessibilityRole="summary">
                    <Text style={[styles.boxText, { color: colors.foreground }]}>
                      {t("resignationDeadline")} {date(r.agDeadline)}{r.daysLeft >= 0 ? ` · ${r.daysLeft} ${t("resignationDaysLeft")}` : ""}
                    </Text>
                    {r.assemblyOverdue ? <Text style={[styles.boxText, { color: colors.destructive }]}>{t("resignationOverdue")}</Text> : null}
                  </View>
                ) : null}
                {r.role === "syndic" && r.interim ? <Text style={[styles.sub, { color: colors.foreground }]}>{t("resignationInterim")} : {r.interim.name}</Text> : null}
                {r.escalation === "no_deputy" ? <Text style={[styles.alert, { color: colors.destructive }]}>{t("resignationNoDeputy")}</Text> : null}
                {r.escalation === "no_successor" ? <Text style={[styles.alert, { color: colors.destructive }]}>{t("resignationNoSuccessor")}</Text> : null}
                {r.successor ? <Text style={[styles.sub, { color: colors.success }]}>{t("resignationSuccessor")} : {r.successor.name}</Text> : null}

                {r.role === "syndic" && r.interimMandateId ? (
                  <View style={{ gap: 6 }}>
                    <Text style={[styles.section, { color: colors.mutedForeground }]}>{t("resignationHandover")}</Text>
                    {ITEMS.map((it) => {
                      const checked = r.handoverItems.find((h) => h.key === it.key)?.done ?? false;
                      return (
                        <TouchableOpacity
                          key={it.key}
                          style={styles.row}
                          disabled={!manage || busy}
                          onPress={() => handover.mutate({ id: r.id, key: it.key, done: !checked })}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked, disabled: !manage }}
                        >
                          <Feather name={checked ? "check-square" : "square"} size={18} color={checked ? colors.success : colors.mutedForeground} />
                          <Text style={[styles.item, { color: colors.foreground }]}>{it.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {manage ? (
                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary + "15" }]} onPress={() => void pickAssembly(r)} disabled={busy}>
                      <Feather name="calendar" size={14} color={colors.tint} />
                      <Text style={[styles.btnText, { color: colors.tint }]}>{r.agMeetingId ? t("resignationAssembly") + " ✓" : t("resignationPickAssembly")}</Text>
                    </TouchableOpacity>
                    {isSyndicAdmin && r.agMeetingId ? (
                      <>
                        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.success + "15" }]} onPress={() => void pickSuccessor(r)} disabled={busy}>
                          <Feather name="user-check" size={14} color={colors.success} />
                          <Text style={[styles.btnText, { color: colors.success }]}>{t("resignationClose")}</Text>
                        </TouchableOpacity>
                        {r.escalation !== "no_successor" ? (
                          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.destructive + "12" }]} onPress={() => close.mutate({ id: r.id, body: { noSuccessor: true } })} disabled={busy}>
                            <Feather name="alert-octagon" size={14} color={colors.destructive} />
                            <Text style={[styles.btnText, { color: colors.destructive }]}>{t("resignationNoSuccessorAction")}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </>
                    ) : null}
                    {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  centerText: { fontSize: 15, textAlign: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "700", textAlign: "left" },
  sub: { fontSize: 12, textAlign: "left" },
  badge: { fontSize: 11, fontWeight: "700" },
  box: { borderRadius: 10, padding: 10, gap: 4 },
  boxText: { fontSize: 13, fontWeight: "600", textAlign: "left" },
  alert: { fontSize: 12, fontWeight: "600", textAlign: "left" },
  section: { fontSize: 12, fontWeight: "700", textAlign: "left" },
  item: { fontSize: 13, textAlign: "left" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  btnText: { fontSize: 12, fontWeight: "700" },
});

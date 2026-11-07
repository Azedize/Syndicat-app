/**
 * Organization of the condominium: statutory bodies (Loi 18-00), meeting
 * roles, and the internal committees the condominium chose. Each committee
 * shows its positions, members, vacancies and — for its members — a
 * workspace (tasks, recommendations to the syndic, read-only views).
 * Committees are internal bodies: they advise and follow up, the general
 * assembly and the syndic keep their legal powers.
 */
import { Feather } from "@/components/ui/Feather";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState, LoadingState } from "@/components/DataState";
import Modal from "@/components/ui/AppModal";
import { askChoice, askText } from "@/components/ui/TextPrompt";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { organization as orgApi, type OrgComponent } from "@/features/governance/api";
import { CAPABILITY_KEYS, TYPE_KEYS } from "@/features/governance/orgLabels";

export default function OrganizationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({ queryKey: ["org-structure"], queryFn: () => orgApi.structure() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["org-structure"] });
  const fail = (err: any) => showToast({ type: "error", title: t("orgStructureTitle"), message: err?.message || t("electionActionFailed") });
  const activate = useMutation({
    mutationFn: () => orgApi.activate(),
    onSuccess: (r) => {
      refresh();
      showToast({ type: "success", title: t("orgStructureTitle"), message: `${t("orgActivated")} (v${r.data.version})` });
    },
    onError: fail,
  });
  const addComponent = useMutation({ mutationFn: (type: string) => orgApi.addComponent(type), onSuccess: refresh, onError: fail });

  const s = data?.data ?? null;
  const manage = !!data?.canManage;
  const statutory = (s?.components ?? []).filter((c) => c.category === "statutory");
  const committees = (s?.components ?? []).filter((c) => c.category !== "statutory" && c.status !== "closed");
  const closed = (s?.components ?? []).filter((c) => c.status === "closed");
  const holder = (role: string) => data?.statutoryHolders.find((h) => h.role === role);
  const opened = s?.components.find((c) => c.id === openId) ?? null;

  const pickNewComponent = async () => {
    const types = ["financial", "maintenance", "security", "communication", "social", "environment", "legal", "audit", "parking", "building", "syndicate_council", "custom"];
    const type = await askChoice({ title: t("orgAddComponent"), choices: types.map((x) => ({ label: t(TYPE_KEYS[x]), value: x })) });
    if (!type) return;
    if (type === "custom") {
      const name = await askText({ title: t("orgTypeCustom"), message: t("orgCustomNamePrompt"), confirmLabel: t("orgAddComponent"), required: true });
      if (name) orgApi.addComponent("custom", { name }).then(refresh, fail);
      return;
    }
    addComponent.mutate(type);
  };

  if (isLoading) return <View style={[styles.root, { backgroundColor: colors.background }]}><ScreenHeader title={t("orgStructureTitle")} /><LoadingState title={t("orgStructureTitle")} /></View>;
  if (isError) return <View style={[styles.root, { backgroundColor: colors.background }]}><ScreenHeader title={t("orgStructureTitle")} /><ErrorState title={t("orgStructureTitle")} description={t("electionActionFailed")} retryLabel={t("retry")} onRetry={() => refetch()} /></View>;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("orgStructureTitle")} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
        {!s ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]}>
            <Feather name="git-branch" size={36} color={colors.mutedForeground} />
            <Text style={[styles.cardTitle, { color: colors.foreground, textAlign: "center" }]}>{t("orgNone")}</Text>
            <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: "center" }]}>{manage ? t("orgNoneManager") : t("orgNoneResident")}</Text>
            {manage ? (
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/organization-wizard" as any)}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>{t("orgCreate")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <>
            {manage && data?.review ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: s.status === "draft" ? colors.warning : colors.border }]}>
                <View style={styles.row}>
                  <Feather name={s.status === "draft" ? "edit-3" : "check-circle"} size={16} color={s.status === "draft" ? colors.warning : colors.success} />
                  <Text style={[styles.cardTitle, { color: colors.foreground, flex: 1 }]}>{s.status === "draft" ? t("orgDraft") : `${t("orgActiveVersion")} ${s.version}`}</Text>
                </View>
                {data.review.errors.map((e) => <Text key={e.code + e.message} style={[styles.small, { color: colors.destructive }]}>• {e.message}</Text>)}
                {data.review.warnings.map((w) => <Text key={w.code + w.message} style={[styles.small, { color: colors.mutedForeground }]}>• {w.message}</Text>)}
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.chip, { backgroundColor: colors.primary + "15" }]} onPress={pickNewComponent}>
                    <Feather name="plus" size={13} color={colors.tint} />
                    <Text style={[styles.chipText, { color: colors.tint }]}>{t("orgAddComponent")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.chip, { backgroundColor: colors.success + "15" }]} onPress={() => activate.mutate()} disabled={activate.isPending || data.review.errors.length > 0}>
                    {activate.isPending ? <ActivityIndicator size="small" color={colors.success} /> : <Feather name="check" size={13} color={colors.success} />}
                    <Text style={[styles.chipText, { color: colors.success }]}>{s.status === "draft" ? t("orgActivate") : t("orgPublishChanges")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <Section title={t("orgStatutoryBodies")} hint={t("orgStatutoryHint")} colors={colors} />
            {statutory.map((c) => {
              const h = c.type === "syndic" || c.type === "vice_syndic" ? holder(c.type) : null;
              return (
                <TouchableOpacity key={c.id} style={[styles.card, styles.row, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]} onPress={() => setOpenId(c.id)} accessibilityRole="button">
                  <View style={[styles.icon, { backgroundColor: colors.primary + "18" }]}><Feather name={c.type === "general_assembly" ? "users" : "shield"} size={18} color={colors.tint} /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t(TYPE_KEYS[c.type])}</Text>
                    <Text style={[styles.small, { color: colors.mutedForeground }]}>
                      {c.type === "general_assembly" ? t("orgAllCoOwners") : h ? h.name : t("orgNotDesignated")}
                    </Text>
                  </View>
                  <Tag label={t("orgTagLegal")} color={colors.tint} />
                </TouchableOpacity>
              );
            })}

            <Section title={t("orgMeetingRoles")} hint={t("orgMeetingRolesHint")} colors={colors} />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.small, { color: colors.foreground }]}>• {t("orgMeetingPresident")}</Text>
              <Text style={[styles.small, { color: colors.foreground }]}>• {t("orgMeetingSecretary")}</Text>
            </View>

            <Section title={t("orgCommittees")} hint={t("orgCommitteesHint")} colors={colors} />
            {committees.length === 0 ? <Text style={[styles.muted, { color: colors.mutedForeground }]}>{t("orgNoCommittee")}</Text> : null}
            {committees.map((c) => {
              const leader = c.positions.find((p) => p.isLeader)?.assignments.find((a) => a.status === "active");
              const members = new Set(c.positions.flatMap((p) => p.assignments.filter((a) => a.status === "active").map((a) => a.userId))).size;
              const vacant = c.positions.filter((p) => p.status === "active" && !p.assignments.some((a) => a.status === "active" && a.kind === "holder")).length;
              return (
                <TouchableOpacity key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: c.mine ? colors.success : colors.border }]} onPress={() => setOpenId(c.id)} accessibilityRole="button">
                  <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: colors.muted }]}><Feather name="layers" size={17} color={colors.foreground} /></View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]}>{c.name}</Text>
                      <Text style={[styles.small, { color: colors.mutedForeground }]}>
                        {leader ? `${leader.userName} · ` : ""}{members} {t("orgMembers")}{vacant ? ` · ${vacant} ${t("orgVacant")}` : ""}
                      </Text>
                    </View>
                    <Tag label={c.legalStatus === "conditional" ? t("orgTagConditional") : t("orgTagInternal")} color={colors.mutedForeground} />
                  </View>
                  {c.status === "inactive" ? <Text style={[styles.small, { color: colors.warning }]}>{t("orgInactive")}</Text> : null}
                  {c.mine ? <Text style={[styles.small, { color: colors.success }]}>{t("orgYouAreMember")}</Text> : null}
                </TouchableOpacity>
              );
            })}
            {manage ? (
              <TouchableOpacity style={[styles.chip, { backgroundColor: colors.primary + "15", alignSelf: "flex-start" }]} onPress={pickNewComponent}>
                <Feather name="plus" size={13} color={colors.tint} />
                <Text style={[styles.chipText, { color: colors.tint }]}>{t("orgAddComponent")}</Text>
              </TouchableOpacity>
            ) : null}
            {closed.length ? (
              <TouchableOpacity onPress={() => setShowClosed((v) => !v)} accessibilityRole="button">
                <Text style={[styles.small, { color: colors.mutedForeground }]}>{showClosed ? "▾" : "▸"} {t("orgClosedComponents")} ({closed.length})</Text>
              </TouchableOpacity>
            ) : null}
            {showClosed
              ? closed.map((c) => (
                  <TouchableOpacity key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.75 }]} onPress={() => setOpenId(c.id)}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{c.name}</Text>
                    {c.closeReason ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{c.closeReason}</Text> : null}
                  </TouchableOpacity>
                ))
              : null}
          </>
        )}
      </ScrollView>
      {opened ? <ComponentSheet component={opened} manage={manage} onClose={() => setOpenId(null)} onChanged={refresh} /> : null}
    </View>
  );
}

function Section({ title, hint, colors }: { title: string; hint: string; colors: any }) {
  return (
    <View style={{ gap: 2, marginTop: 4 }}>
      <Text style={[styles.section, { color: colors.foreground }]} accessibilityRole="header">{title}</Text>
      <Text style={[styles.small, { color: colors.mutedForeground }]}>{hint}</Text>
    </View>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color + "60" }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

/** Detail of a component: positions, members, and the workspace for its members. */
function ComponentSheet({ component: c, manage, onClose, onChanged }: { component: OrgComponent; manage: boolean; onClose: () => void; onChanged: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const canWork = c.status === "active" && c.category !== "statutory" && (c.mine || manage);
  const ws = useQuery({ queryKey: ["org-workspace", c.id], queryFn: () => orgApi.workspace(c.id), enabled: canWork });
  const fail = (err: any) => showToast({ type: "error", title: c.name, message: err?.message || t("electionActionFailed") });
  const done = () => {
    onChanged();
    ws.refetch();
  };
  const caps = new Set(ws.data?.data.capabilities ?? []);

  const pickPerson = async (title: string) => {
    const people = (await orgApi.people()).data;
    return askChoice({ title, choices: people.map((p) => ({ label: p.name, value: p.id })) });
  };
  const assign = async (positionId: string, title: string) => {
    const userId = await pickPerson(title);
    if (userId) orgApi.assign(positionId, userId).then(done, fail);
  };
  const replaceOrEnd = async (assignmentId: string, name: string) => {
    const action = await askChoice({ title: name, choices: [{ label: t("orgReplace"), value: "replace" }, { label: t("orgEndAssignment"), value: "end" }] });
    if (!action) return;
    const reason = await askText({ title: action === "replace" ? t("orgReplace") : t("orgEndAssignment"), message: t("orgReasonPrompt"), confirmLabel: t("actionConfirm"), required: true });
    if (!reason) return;
    if (action === "end") return void orgApi.endAssignment(assignmentId, reason).then(done, fail);
    const userId = await pickPerson(t("orgReplace"));
    if (userId) orgApi.replace(assignmentId, userId, reason).then(done, fail);
  };
  const addPosition = async () => {
    const title = await askText({ title: t("orgAddPosition"), message: t("orgPositionTitlePrompt"), confirmLabel: t("orgAddPosition"), required: true });
    if (title) orgApi.addPosition(c.id, { title, permissions: ["tasks.view", "recommendations.create"] }).then(done, fail);
  };
  const close = async () => {
    const reason = await askText({ title: t("orgCloseComponent"), message: t("orgCloseReasonPrompt"), confirmLabel: t("orgCloseComponent"), destructive: true, required: true });
    if (reason) orgApi.closeComponent(c.id, reason).then(() => { done(); onClose(); }, fail);
  };
  const remove = () => orgApi.removeComponent(c.id).then(() => { done(); onClose(); }, fail);
  const addTask = async (kind: "task" | "recommendation" | "report") => {
    const title = await askText({ title: t(kind === "recommendation" ? "orgNewRecommendation" : kind === "report" ? "orgNewReport" : "orgNewTask"), message: t("orgTaskTitlePrompt"), confirmLabel: t("actionConfirm"), required: true });
    if (title) orgApi.addTask(c.id, { kind, title }).then(done, fail);
  };
  const respond = async (id: string) => {
    const r = await askChoice({ title: t("orgRespond"), choices: [{ label: t("orgAccept"), value: "accepted" }, { label: t("orgDecline"), value: "declined" }] });
    if (r) orgApi.respond(id, r as "accepted" | "declined").then(done, fail);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.row, { padding: 16 }]}>
            <Text style={[styles.section, { color: colors.foreground, flex: 1 }]} accessibilityRole="header">{c.category === "statutory" ? t(TYPE_KEYS[c.type]) : c.name}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel={t("close")} hitSlop={12}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 24 }}>
            <Text style={[styles.small, { color: colors.mutedForeground }]}>
              {c.legalStatus === "statutory" ? `${t("orgTagLegal")} — Loi 18-00, ${c.legalBasis ?? ""}` : c.legalStatus === "conditional" ? `${t("orgCouncilNote")} (${c.legalBasis ?? ""})` : t("orgInternalNote")}
            </Text>
            {c.description ? <Text style={[styles.body, { color: colors.foreground }]}>{c.description}</Text> : null}
            {c.objectives ? <Text style={[styles.body, { color: colors.foreground }]}>{c.objectives}</Text> : null}
            {c.responsibilities.length ? (
              <View style={{ gap: 4 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("orgResponsibilities")}</Text>
                {c.responsibilities.map((r) => <Text key={r} style={[styles.small, { color: colors.foreground }]}>• {r}</Text>)}
              </View>
            ) : null}
            {c.category === "statutory" && c.type !== "general_assembly" ? <Text style={[styles.small, { color: colors.foreground }]}>{t("orgStatutoryHolderNote")}</Text> : null}

            {c.positions.map((p) => {
              const active = p.assignments.filter((a) => a.status === "active");
              const ended = p.assignments.filter((a) => a.status === "ended");
              return (
                <View key={p.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.row}>
                    <Feather name={p.isLeader ? "star" : "user"} size={14} color={p.isLeader ? colors.warning : colors.mutedForeground} />
                    <Text style={[styles.cardTitle, { color: colors.foreground, flex: 1 }]}>{p.title}</Text>
                    {manage && c.status !== "closed" ? (
                      <TouchableOpacity onPress={() => void assign(p.id, p.title)} accessibilityLabel={t("orgAssign")} hitSlop={8}><Feather name="user-plus" size={16} color={colors.tint} /></TouchableOpacity>
                    ) : null}
                  </View>
                  {active.length === 0 ? <Text style={[styles.small, { color: colors.warning }]}>{t("orgVacantPosition")}</Text> : null}
                  {active.map((a) => (
                    <TouchableOpacity key={a.id} disabled={!manage} onPress={() => void replaceOrEnd(a.id, a.userName)} style={styles.row}>
                      <Text style={[styles.body, { color: colors.foreground, flex: 1 }]}>{a.userName}{a.kind === "substitute" ? ` (${t("orgSubstitute")})` : ""}</Text>
                      <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgSince")} {a.startDate}</Text>
                    </TouchableOpacity>
                  ))}
                  {ended.map((a) => (
                    <Text key={a.id} style={[styles.small, { color: colors.mutedForeground }]}>{a.userName} · {a.startDate} → {a.endDate}{a.endReason ? ` · ${a.endReason}` : ""}</Text>
                  ))}
                  {p.permissions.length ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{p.permissions.map((x) => t(CAPABILITY_KEYS[x] ?? x)).join(" · ")}</Text> : null}
                </View>
              );
            })}

            {canWork ? (
              <View style={{ gap: 8 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("orgWorkspace")}</Text>
                {ws.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
                <View style={styles.actions}>
                  {caps.has("tasks.manage") ? <Chip label={t("orgNewTask")} icon="check-square" onPress={() => void addTask("task")} colors={colors} /> : null}
                  {caps.has("recommendations.create") ? <Chip label={t("orgNewRecommendation")} icon="send" onPress={() => void addTask("recommendation")} colors={colors} /> : null}
                  {caps.has("reports.create") ? <Chip label={t("orgNewReport")} icon="file-text" onPress={() => void addTask("report")} colors={colors} /> : null}
                </View>
                {(ws.data?.data.tasks ?? []).map((task) => (
                  <View key={task.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.body, { color: colors.foreground }]}>{task.title}</Text>
                    <Text style={[styles.small, { color: colors.mutedForeground }]}>
                      {t(task.kind === "recommendation" ? "orgKindRecommendation" : task.kind === "report" ? "orgKindReport" : "orgKindTask")} · {t(`orgTaskStatus_${task.status}`)}
                      {task.syndicResponse ? ` · ${t(task.syndicResponse === "accepted" ? "orgAccepted" : "orgDeclined")}` : ""}
                    </Text>
                    {manage && task.kind === "recommendation" && !task.syndicResponse ? <Chip label={t("orgRespond")} icon="message-square" onPress={() => void respond(task.id)} colors={colors} /> : null}
                    {task.kind === "task" && task.status !== "done" && (caps.has("tasks.manage") || manage) ? (
                      <Chip label={t("orgMarkDone")} icon="check" onPress={() => orgApi.updateTask(task.id, "done").then(done, fail)} colors={colors} />
                    ) : null}
                  </View>
                ))}
                {ws.data?.data.finance ? (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("orgFinanceReadOnly")}</Text>
                    {ws.data.data.finance.expenses.slice(0, 8).map((e: any) => (
                      <Text key={e.id} style={[styles.small, { color: colors.foreground }]}>{e.reference} · {e.label} · {Number(e.amount).toLocaleString()} MAD · {e.status}</Text>
                    ))}
                  </View>
                ) : null}
                {ws.data?.data.maintenance ? (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("orgMaintenanceReadOnly")}</Text>
                    {ws.data.data.maintenance.openClaims.slice(0, 8).map((x: any) => (
                      <Text key={x.id} style={[styles.small, { color: colors.foreground }]}>{x.reference} · {x.title} · {x.status}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {manage && c.category !== "statutory" && c.status !== "closed" ? (
              <View style={styles.actions}>
                <Chip label={t("orgAddPosition")} icon="plus" onPress={() => void addPosition()} colors={colors} />
                <Chip label={t("orgCloseComponent")} icon="archive" onPress={() => void close()} colors={colors} danger />
                <Chip label={t("orgDeleteUnused")} icon="trash-2" onPress={() => void remove()} colors={colors} danger />
              </View>
            ) : null}
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ label, icon, onPress, colors, danger }: { label: string; icon: any; onPress: () => void; colors: any; danger?: boolean }) {
  const tone = danger ? colors.destructive : colors.tint;
  return (
    <TouchableOpacity style={[styles.chip, { backgroundColor: tone + "15" }]} onPress={onPress} accessibilityRole="button">
      <Feather name={icon} size={13} color={tone} />
      <Text style={[styles.chipText, { color: tone }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700", textAlign: "left" },
  section: { fontSize: 17, fontWeight: "800", textAlign: "left" },
  label: { fontSize: 12, fontWeight: "700", textAlign: "left" },
  body: { fontSize: 14, textAlign: "left" },
  small: { fontSize: 12, lineHeight: 17, textAlign: "left" },
  muted: { fontSize: 13, textAlign: "left" },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 10, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  chipText: { fontSize: 12, fontWeight: "700" },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, marginTop: 6 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" },
  sheet: { maxHeight: "90%", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
});

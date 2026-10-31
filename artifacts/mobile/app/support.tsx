/**
 * support.tsx — Level-1 Syndicate Support
 *
 * Accessible by: syndicate_admin, member, tenant
 * NOT accessible by: super_admin (they manage Level-2 platform tickets via /platform-support)
 *
 * Hierarchy:
 *   resident / owner / tenant → Syndicate Administration (here)
 *   syndicate_admin can escalate any ticket → Platform Support (Level 2)
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import type { SupportTicket, TicketReply } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import ScreenHeader from "@/components/ScreenHeader";
import EmptyState from "@/components/EmptyState";
import { ErrorState } from "@/components/DataState";
import { Avatar, Button, Card, Chip, ListItem, SheetHeader, Skeleton, StatusBadge, TextField, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";

// ─── Types ────────────────────────────────────────────────────────────────────

type Filter = "all" | "open" | "in_progress" | "resolved";
type SyndicateCat = "paiement" | "maintenance" | "juridique" | "administratif" | "general";
type FeatherName = keyof typeof Feather.glyphMap;

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { key: SyndicateCat; labelKey: string; icon: FeatherName; tone: StatusTone }[] = [
  { key: "paiement", labelKey: "supportCategoryPayment", icon: "credit-card", tone: "danger" },
  { key: "maintenance", labelKey: "supportCategoryMaintenance", icon: "tool", tone: "warning" },
  { key: "juridique", labelKey: "supportCategoryLegal", icon: "shield", tone: "primary" },
  { key: "administratif", labelKey: "supportCategoryAdministrative", icon: "file-text", tone: "info" },
  { key: "general", labelKey: "supportCategoryGeneral", icon: "help-circle", tone: "neutral" },
];

const PRIORITIES: { key: SupportTicket["priority"]; labelKey: string; icon: FeatherName; tone: StatusTone }[] = [
  { key: "high", labelKey: "priorityUrgent", icon: "alert-circle", tone: "danger" },
  { key: "medium", labelKey: "priorityNormal", icon: "alert-triangle", tone: "warning" },
  { key: "low", labelKey: "priorityLow", icon: "info", tone: "info" },
];

const STATUS_CFG: Record<string, { tone: StatusTone; icon: FeatherName; labelKey: string }> = {
  open: { tone: "danger", icon: "alert-circle", labelKey: "ticketOpen" },
  in_progress: { tone: "warning", icon: "clock", labelKey: "ticketInProgress" },
  resolved: { tone: "success", icon: "check-circle", labelKey: "ticketResolved" },
  closed: { tone: "neutral", icon: "x-circle", labelKey: "ticketClosed" },
};

const catCfg = (c: string) => CATEGORIES.find((x) => x.key === c) ?? CATEGORIES[4];
const priCfg = (p: string) => PRIORITIES.find((x) => x.key === p) ?? PRIORITIES[1];
const stCfg = (s: string) => STATUS_CFG[s] ?? STATUS_CFG.open;

const SUBJECT_PLACEHOLDER: Record<SyndicateCat, string> = {
  paiement: "supportSubjectPaymentPlaceholder",
  maintenance: "supportSubjectMaintenancePlaceholder",
  juridique: "supportSubjectLegalPlaceholder",
  administratif: "supportSubjectAdministrativePlaceholder",
  general: "supportSubjectGeneralPlaceholder",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t, isRTL } = useLanguage();
  const { date } = useFormat();
  const { showToast } = useToast();

  const isSyndicateAdmin = user?.role === "syndicate_admin";
  const isMember = user?.role === "member" || user?.role === "tenant";

  // ── List state ──
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  // ── Detail state ──
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [resolving, setResolving] = useState(false);

  // ── New ticket state ──
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPri, setNewPri] = useState<SupportTicket["priority"]>("medium");
  const [newCat, setNewCat] = useState<SyndicateCat>("general");
  const [submitting, setSubmitting] = useState(false);

  // ─── Fetch tickets ────────────────────────────────────────────────────────

  const fetchTickets = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setListError(false);
      try {
        const res = await apiRequest("/support", "GET", undefined, token);
        const rows: any[] = res?.data ?? res?.items ?? [];
        setTickets(
          rows.map((r: any) => ({
            id: String(r.id),
            title: String(r.title ?? ""),
            description: String(r.description ?? ""),
            submittedBy: String(r.submittedByName ?? r.submittedBy ?? ""),
            submittedById: String(r.submittedById ?? ""),
            syndicate: String(r.syndicateName ?? ""),
            syndicateId: String(r.syndicateId ?? ""),
            priority: r.priority ?? "medium",
            status: r.status ?? "open",
            date: String(r.createdAt ?? r.date ?? ""),
            scope: "syndicate",
            category: r.category ?? "general",
          })),
        );
      } catch {
        if (!silent) setListError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // ─── Fetch replies for selected ticket ────────────────────────────────────

  const fetchReplies = useCallback(
    async (ticketId: string) => {
      setRepliesLoading(true);
      setRepliesError(false);
      try {
        const res: any = await apiRequest(`/support/${ticketId}`, "GET", undefined, token);
        setReplies(res?.data?.replies ?? []);
      } catch {
        setReplies([]);
        setRepliesError(true);
      } finally {
        setRepliesLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!selected) {
      setReplies([]);
      setRepliesError(false);
      return;
    }
    fetchReplies(selected.id);
  }, [fetchReplies, selected]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const openNew = () => {
    setShowNew(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDesc.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest("/support", "POST", { title: newTitle.trim(), description: newDesc.trim(), priority: newPri, category: newCat, scope: "syndicate" }, token);
      showToast({ type: "success", title: t("supportTicketSubmitted"), message: t("supportTicketSubmittedMessage") });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNew(false);
      setNewTitle("");
      setNewDesc("");
      setNewPri("medium");
      setNewCat("general");
      fetchTickets(true);
    } catch {
      showToast({ type: "error", title: t("error"), message: t("supportSubmitError") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selected) return;
    setReplying(true);
    try {
      await apiRequest(`/support/${selected.id}/replies`, "POST", { text: replyText.trim() }, token);
      setReplyText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("supportReplySent") });
      await fetchReplies(selected.id);
      // The API moves the ticket to in_progress on a reply.
      setTickets((prev) => prev.map((tk) => (tk.id === selected.id ? { ...tk, status: "in_progress" } : tk)));
      setSelected((s) => (s ? { ...s, status: s.status === "open" ? "in_progress" : s.status } : s));
    } catch {
      showToast({ type: "error", title: t("error"), message: t("supportReplyError") });
    } finally {
      setReplying(false);
    }
  };

  const handleResolve = async (id: string) => {
    setResolving(true);
    try {
      await apiRequest(`/support/${id}/resolve`, "PUT", undefined, token);
      showToast({ type: "success", title: t("supportTicketResolved") });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelected(null);
      fetchTickets(true);
    } catch {
      showToast({ type: "error", title: t("error"), message: t("supportResolveError") });
    } finally {
      setResolving(false);
    }
  };

  const handleEscalate = async (ticket: SupportTicket) => {
    setEscalating(true);
    try {
      await apiRequest(`/support/${ticket.id}/escalate`, "POST", undefined, token);
      showToast({ type: "success", title: t("supportTicketEscalated"), message: t("supportEscalatedMessage") });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelected(null);
      fetchTickets(true);
    } catch {
      showToast({ type: "error", title: t("error"), message: t("supportEscalateError") });
    } finally {
      setEscalating(false);
    }
  };

  // ─── Derived data ─────────────────────────────────────────────────────────

  const filtered = tickets.filter((tk) => filter === "all" || tk.status === filter);
  const countOf = (s: string) => tickets.filter((tk) => tk.status === s).length;
  const openCount = countOf("open");

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: `${t("supportFilterAll")} · ${tickets.length}` },
    { key: "open", label: `${t("supportFilterOpen")} · ${openCount}` },
    { key: "in_progress", label: `${t("supportFilterInProgress")} · ${countOf("in_progress")}` },
    { key: "resolved", label: `${t("supportFilterResolved")} · ${countOf("resolved")}` },
  ];

  const subtitle = loading
    ? undefined
    : isSyndicateAdmin
      ? `${t("supportAdminSubtitle")} · ${openCount} ${t("supportOpenCount")}`
      : openCount > 0
        ? `${openCount} ${t("supportPendingCount")}`
        : t("supportNoPending");

  const closedTicket = selected && (selected.status === "resolved" || selected.status === "closed");

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader
        title={isSyndicateAdmin ? t("supportSyndicateTitle") : t("supportMyRequestsTitle")}
        subtitle={subtitle}
        action={{ icon: "plus", label: t("supportNewTicket"), onPress: openNew }}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ flexGrow: 0 }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={92} radius={RADIUS.LG} />
          ))}
        </View>
      ) : listError ? (
        <ErrorState title={t("supportUnavailableTitle")} description={t("supportUnavailableDescription")} retryLabel={t("supportRetry")} onRetry={() => fetchTickets()} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(tk) => tk.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTickets(true); }} tintColor={colors.primary} />}
          ListHeaderComponent={
            isMember ? (
              <View style={[styles.note, { backgroundColor: colors.infoSoft, marginBottom: 12 }]}>
                <Feather name="info" size={15} color={colors.info} />
                <Text style={[TYPE.secondary, { color: colors.infoText, flex: 1, textAlign: "auto" }]}>{t("supportMemberBanner")}</Text>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              icon="inbox"
              title={t("noTickets")}
              description={filter === "all" ? t("supportCreateFirst") : t("supportNoCategoryTickets")}
              actionLabel={filter === "all" ? t("supportNewTicket") : undefined}
              onAction={filter === "all" ? openNew : undefined}
            />
          }
          renderItem={({ item: ticket }) => {
            const pc = priCfg(ticket.priority);
            const sc = stCfg(ticket.status);
            const cc = catCfg(ticket.category);
            const ct = toneColors(colors, cc.tone);
            return (
              <Card
                padding="md"
                onPress={() => {
                  setSelected(ticket);
                  setReplyText("");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                accessibilityLabel={`${ticket.title} — ${t(sc.labelKey)}`}
                style={{ gap: 10 }}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.cardIcon, { backgroundColor: ct.bg }]}>
                    <Feather name={cc.icon} size={18} color={ct.fg} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text style={[TYPE.bodyStrong, { color: colors.foreground, textAlign: "auto" }]} numberOfLines={2}>
                      {ticket.title}
                    </Text>
                    <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]} numberOfLines={1}>
                      {[isSyndicateAdmin ? ticket.submittedBy : null, t(cc.labelKey), date(ticket.date)].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </View>
                <View style={styles.badges}>
                  <StatusBadge label={t(sc.labelKey)} tone={sc.tone} icon={sc.icon} />
                  <StatusBadge label={t(pc.labelKey)} tone={pc.tone} icon={null} />
                </View>
              </Card>
            );
          }}
        />
      )}

      {/* ── Ticket detail ── */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected ? (
          <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <SheetHeader title={`${t("supportTicketDetail")} #${selected.id.slice(-6).toUpperCase()}`} subtitle={t(catCfg(selected.category).labelKey)} onClose={() => setSelected(null)} />
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[TYPE.headline, { color: colors.foreground, textAlign: "auto" }]}>{selected.title}</Text>
              <View style={styles.badges}>
                <StatusBadge label={t(stCfg(selected.status).labelKey)} tone={stCfg(selected.status).tone} icon={stCfg(selected.status).icon} size="md" />
                <StatusBadge label={t(priCfg(selected.priority).labelKey)} tone={priCfg(selected.priority).tone} icon={priCfg(selected.priority).icon} size="md" />
              </View>

              <Card padding="none">
                <ListItem icon="user" title={selected.submittedBy || "—"} subtitle={t("supportSubmittedBy")} divider />
                <ListItem icon="calendar" title={date(selected.date)} subtitle={t("date")} />
              </Card>

              <Card padding="lg" style={{ gap: 6 }}>
                <Text style={[TYPE.label, { color: colors.textMuted }]}>{t("supportDescription")}</Text>
                <Text style={[TYPE.body, { color: colors.foreground, textAlign: "auto" }]} selectable>
                  {selected.description}
                </Text>
              </Card>

              {/* Conversation */}
              {repliesLoading ? (
                <View style={styles.inline}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("supportConversationLoading")}</Text>
                </View>
              ) : repliesError ? (
                <Card padding="md" style={{ gap: 10 }}>
                  <View style={styles.inline}>
                    <Feather name="alert-circle" size={16} color={colors.danger} />
                    <Text style={[TYPE.bodyStrong, { color: colors.foreground, flex: 1 }]}>{t("supportConversationUnavailable")}</Text>
                  </View>
                  <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("supportConversationUnavailableDescription")}</Text>
                  <Button label={t("supportRetry")} icon="refresh-cw" variant="secondary" size="sm" onPress={() => fetchReplies(selected.id)} />
                </Card>
              ) : replies.length > 0 ? (
                <View style={{ gap: 10 }}>
                  <Text style={[TYPE.subtitle, { color: colors.foreground }]}>
                    {t("supportConversation")} ({replies.length})
                  </Text>
                  {replies.map((rp) => {
                    // A reply from anyone but the requester comes from the syndicate team.
                    const fromTeam = rp.authorId !== selected.submittedById;
                    const mine = rp.authorId === user?.id;
                    return (
                      <View key={rp.id} style={[styles.bubbleRow, mine && { flexDirection: "row-reverse" }]}>
                        <Avatar name={rp.authorName ?? "?"} size={30} />
                        <View
                          style={[
                            styles.bubble,
                            { backgroundColor: fromTeam ? colors.primarySoft : colors.card, borderColor: fromTeam ? "transparent" : colors.border },
                          ]}
                        >
                          <View style={styles.bubbleHdr}>
                            <Text style={[TYPE.label, { color: fromTeam ? colors.secondaryForeground : colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                              {rp.authorName}
                            </Text>
                            <Text style={[TYPE.caption, { color: colors.textMuted }]}>{date(rp.createdAt)}</Text>
                          </View>
                          <Text style={[TYPE.body, { color: colors.foreground, textAlign: "auto" }]} selectable>
                            {rp.text}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {!closedTicket ? (
                <View style={{ gap: 10 }}>
                  <TextField
                    label={isSyndicateAdmin ? t("supportReplyToTicket") : t("supportAddComment")}
                    placeholder={t("supportWriteReply")}
                    multiline
                    value={replyText}
                    onChangeText={setReplyText}
                  />
                  <Button label={t("supportSend")} icon="send" fullWidth loading={replying} disabled={!replyText.trim()} onPress={handleReply} />
                </View>
              ) : (
                <View style={[styles.note, { backgroundColor: colors.successSoft }]}>
                  <Feather name="check-circle" size={16} color={colors.success} />
                  <Text style={[TYPE.secondary, { color: colors.successText, flex: 1, textAlign: "auto" }]}>{t("supportResolvedBanner")}</Text>
                </View>
              )}

              {isSyndicateAdmin && !closedTicket ? (
                <Card padding="none">
                  <ListItem icon="check" iconTone="success" title={t("supportResolveAction")} onPress={() => handleResolve(selected.id)} divider trailing={resolving ? <ActivityIndicator size="small" color={colors.success} /> : undefined} chevron={!resolving} />
                  <ListItem
                    icon="trending-up"
                    iconTone="info"
                    title={escalating ? t("supportEscalating") : t("supportEscalateAction")}
                    subtitle={t("supportEscalateDescription")}
                    onPress={escalating ? undefined : () => handleEscalate(selected)}
                    trailing={escalating ? <ActivityIndicator size="small" color={colors.info} /> : undefined}
                    chevron={!escalating}
                  />
                </Card>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>

      {/* ── New ticket ── */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNew(false)}>
        <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <SheetHeader title={t("supportNewTicket")} subtitle={`${t("supportSubmittedBy")} : ${user?.name ?? ""}`} onClose={() => setShowNew(false)} />
          <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>
                {t("supportCategory")} <Text style={{ color: colors.danger }}>*</Text>
              </Text>
              <View style={styles.badges}>
                {CATEGORIES.map((c) => (
                  <Chip key={c.key} label={t(c.labelKey)} icon={c.icon} selected={newCat === c.key} onPress={() => setNewCat(c.key)} />
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{t("ticketPriorityLabel")}</Text>
              <View style={styles.badges}>
                {PRIORITIES.map((p) => (
                  <Chip key={p.key} label={t(p.labelKey)} icon={p.icon} selected={newPri === p.key} onPress={() => setNewPri(p.key)} />
                ))}
              </View>
            </View>

            <TextField label={t("supportSubject")} required value={newTitle} onChangeText={setNewTitle} placeholder={t(SUBJECT_PLACEHOLDER[newCat])} />
            <TextField label={t("supportDescription")} required value={newDesc} onChangeText={setNewDesc} placeholder={t("supportDescriptionPlaceholder")} multiline />

            <View style={[styles.note, { backgroundColor: colors.infoSoft }]}>
              <Feather name="info" size={15} color={colors.info} />
              <Text style={[TYPE.secondary, { color: colors.infoText, flex: 1, textAlign: "auto" }]}>{t("supportMemberBanner")}</Text>
            </View>

            <Button
              label={submitting ? t("supportSending") : t("supportSubmitRequest")}
              icon="send"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={!newTitle.trim() || !newDesc.trim()}
              onPress={handleCreate}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: RADIUS.MD },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubble: { flex: 1, borderRadius: RADIUS.MD, borderWidth: 1, padding: 12, gap: 4 },
  bubbleHdr: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});

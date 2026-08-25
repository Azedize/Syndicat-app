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
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import type { SupportTicket, TicketReply } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

// ─── Types ────────────────────────────────────────────────────────────────────

type Filter = "all" | "open" | "in_progress" | "resolved";

type SyndicateCat = "paiement" | "maintenance" | "juridique" | "administratif" | "general";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { key: SyndicateCat; labelKey: string; icon: keyof typeof Feather.glyphMap; color: string }[] = [
  { key: "paiement",       labelKey: "supportCategoryPayment",      icon: "credit-card", color: "#ef4444" },
  { key: "maintenance",    labelKey: "supportCategoryMaintenance",   icon: "tool",        color: "#f59e0b" },
  { key: "juridique",      labelKey: "supportCategoryLegal",          icon: "shield",      color: "#8b5cf6" },
  { key: "administratif",  labelKey: "supportCategoryAdministrative", icon: "file-text",  color: "#3b82f6" },
  { key: "general",        labelKey: "supportCategoryGeneral",         icon: "help-circle", color: "#6b7280" },
];

const PRIORITIES: { key: SupportTicket["priority"]; labelKey: string; icon: keyof typeof Feather.glyphMap; color: string }[] = [
  { key: "high",   labelKey: "priorityUrgent", icon: "alert-circle",   color: "#ef4444" },
  { key: "medium", labelKey: "priorityNormal", icon: "alert-triangle", color: "#f59e0b" },
  { key: "low",    labelKey: "priorityLow",    icon: "info",            color: "#3b82f6" },
];

const STATUS_CFG = {
  open:        { color: "#ef4444", icon: "alert-circle" as const,   labelKey: "ticketOpen" },
  in_progress: { color: "#f59e0b", icon: "clock" as const,          labelKey: "ticketInProgress" },
  resolved:    { color: "#10b981", icon: "check-circle" as const,   labelKey: "ticketResolved" },
  closed:      { color: "#6b7280", icon: "x-circle" as const,       labelKey: "ticketClosed" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function catCfg(c: string) {
  return CATEGORIES.find((x) => x.key === c) ?? CATEGORIES[4];
}
function priCfg(p: string) {
  return PRIORITIES.find((x) => x.key === p) ?? PRIORITIES[1];
}
function stCfg(s: string) {
  return STATUS_CFG[s as keyof typeof STATUS_CFG] ?? STATUS_CFG.open;
}
function fmtDate(d: string, lang: string) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d.slice(0, 10);
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";
  return dt.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupportScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t, lang, isRTL } = useLanguage();
  const { showToast } = useToast();
  const { isWide } = useBreakpoints();

  const isSyndicateAdmin = user?.role === "syndicate_admin";
  const isMember         = user?.role === "member" || user?.role === "tenant";
  const topPad           = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const rowDirection = isRTL ? "row-reverse" : "row";

  // ── List state ──
  const [tickets,  setTickets]  = useState<SupportTicket[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [listError, setListError] = useState(false);
  const [filter,   setFilter]   = useState<Filter>("all");

  // ── Detail state ──
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replies,  setReplies]  = useState<TicketReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [escalating, setEscalating] = useState(false);

  // ── New ticket state ──
  const [showNew,    setShowNew]    = useState(false);
  const [newTitle,   setNewTitle]   = useState("");
  const [newDesc,    setNewDesc]    = useState("");
  const [newPri,     setNewPri]     = useState<SupportTicket["priority"]>("medium");
  const [newCat,     setNewCat]     = useState<SyndicateCat>("general");
  const [submitting, setSubmitting] = useState(false);

  // ─── Fetch tickets ────────────────────────────────────────────────────────

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setListError(false);
    try {
      const res = await apiRequest("/support", "GET", undefined, token);
      const rows: any[] = res?.data ?? res?.items ?? [];
      setTickets(rows.map((r: any) => ({
        id:            String(r.id),
        title:         String(r.title ?? ""),
        description:   String(r.description ?? ""),
        submittedBy:   String(r.submittedByName ?? r.submittedBy ?? ""),
        submittedById: String(r.submittedById ?? ""),
        syndicate:     String(r.syndicateName ?? ""),
        syndicateId:   String(r.syndicateId ?? ""),
        priority:      r.priority ?? "medium",
        status:        r.status ?? "open",
        date:          String(r.createdAt ?? r.date ?? ""),
        scope:         "syndicate",
        category:      r.category ?? "general",
      })));
    } catch {
      setListError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // ─── Fetch replies for selected ticket ────────────────────────────────────

  const fetchReplies = useCallback(async (ticketId: string) => {
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
  }, [token]);

  useEffect(() => {
    if (!selected) {
      setReplies([]);
      setRepliesError(false);
      return;
    }
    fetchReplies(selected.id);
  }, [fetchReplies, selected]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDesc.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest("/support", "POST", {
        title:       newTitle.trim(),
        description: newDesc.trim(),
        priority:    newPri,
        category:    newCat,
        scope:       "syndicate",
      }, token);
      showToast({ type: "success", title: t("supportTicketSubmitted"), message: t("supportTicketSubmittedMessage") });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNew(false);
      setNewTitle(""); setNewDesc(""); setNewPri("medium"); setNewCat("general");
      fetchTickets();
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
      // Refresh replies
       await fetchReplies(selected.id);
      // Mark in_progress locally
      setTickets((prev) => prev.map((tk) => tk.id === selected.id ? { ...tk, status: "in_progress" } : tk));
    } catch {
      showToast({ type: "error", title: t("error"), message: t("supportReplyError") });
    } finally {
      setReplying(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await apiRequest(`/support/${id}/resolve`, "PUT", undefined, token);
      showToast({ type: "success", title: t("supportTicketResolved") });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelected(null);
      fetchTickets();
    } catch {
      showToast({ type: "error", title: t("error"), message: t("supportResolveError") });
    }
  };

  const handleEscalate = async (ticket: SupportTicket) => {
    setEscalating(true);
    try {
      await apiRequest(`/support/${ticket.id}/escalate`, "POST", undefined, token);
      showToast({
        type:    "success",
        title:   t("supportTicketEscalated"),
        message: t("supportEscalatedMessage"),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelected(null);
      fetchTickets();
    } catch {
      showToast({ type: "error", title: t("error"), message: t("supportEscalateError") });
    } finally {
      setEscalating(false);
    }
  };

  // ─── Derived data ─────────────────────────────────────────────────────────

  const filtered = tickets.filter((tk) => filter === "all" || tk.status === filter);
  const openCount = tickets.filter((tk) => tk.status === "open").length;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all",         label: t("supportFilterAll") },
    { key: "open",        label: t("supportFilterOpen") },
    { key: "in_progress", label: t("supportFilterInProgress") },
    { key: "resolved",    label: t("supportFilterResolved") },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { flexDirection: rowDirection, paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: isRTL ? "flex-end" : "flex-start" }}>
          <Text style={[styles.title, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
            {isSyndicateAdmin ? t("supportSyndicateTitle") : t("supportMyRequestsTitle")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>
            {isSyndicateAdmin
              ? `${t("supportAdminSubtitle")} · ${openCount} ${t("supportOpenCount")}`
              : openCount > 0
                ? `${openCount} ${t("supportPendingCount")}`
                : t("supportNoPending")}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => { setShowNew(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Info banner for members ── */}
      {isMember && (
        <View style={[styles.infoBanner, { flexDirection: rowDirection, backgroundColor: colors.primary + "10", borderBottomColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.primary} />
          <Text style={[styles.infoBannerText, { color: colors.primary }]}>
            {t("supportMemberBanner")}
          </Text>
        </View>
      )}

      {/* ── Stats strip ── */}
      <View style={[styles.statsStrip, { flexDirection: rowDirection, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: t("supportStatOpen"),       count: tickets.filter((t) => t.status === "open").length,        color: "#ef4444" },
          { label: t("supportStatInProgress"), count: tickets.filter((t) => t.status === "in_progress").length, color: "#f59e0b" },
          { label: t("supportStatResolved"),   count: tickets.filter((t) => t.status === "resolved").length,   color: "#10b981" },
          { label: t("supportStatTotal"),       count: tickets.length,                                             color: colors.primary },
        ].map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && <View style={[styles.statDiv, { backgroundColor: colors.border }]} />}
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.count}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* ── Filters ── */}
      <View style={[styles.filterRow, { flexDirection: rowDirection, borderBottomColor: colors.border }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, { backgroundColor: filter === f.key ? colors.primary : "transparent" }]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterLbl, { color: filter === f.key ? "#fff" : colors.mutedForeground }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : listError ? (
        <View style={styles.recovery}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.destructive + "12" }]}>
            <Feather name="wifi-off" size={30} color={colors.destructive} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("supportUnavailableTitle")}</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{t("supportUnavailableDescription")}</Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={fetchTickets}>
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.emptyBtnTxt}>{t("supportRetry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(tk) => tk.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "12" }]}>
                <Feather name="inbox" size={36} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noTickets")}</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                {filter === "all" ? t("supportCreateFirst") : t("supportNoCategoryTickets")}
              </Text>
              {filter === "all" && (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                  onPress={() => { setShowNew(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Feather name="plus" size={14} color="#fff" />
                  <Text style={styles.emptyBtnTxt}>{t("supportNewTicket")}</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: ticket }) => {
            const pc = priCfg(ticket.priority);
            const sc = stCfg(ticket.status);
            const cc = catCfg(ticket.category);
            return (
              <TouchableOpacity
                style={[styles.card, {
                  backgroundColor: colors.card,
                  borderColor:     colors.border,
                  borderLeftColor: isRTL ? colors.border : pc.color,
                  borderRightColor: isRTL ? pc.color : colors.border,
                }]}
                onPress={() => { setSelected(ticket); setReplyText(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.75}
              >
                <View style={[styles.cardTop, { flexDirection: rowDirection }]}>
                  <View style={[styles.cardIcon, { backgroundColor: cc.color + "15" }]}>
                    <Feather name={cc.icon} size={18} color={cc.color} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {ticket.title}
                    </Text>
                    <View style={[styles.cardMeta, { flexDirection: rowDirection }]}>
                      <Text style={[styles.cardBy, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {ticket.submittedBy}
                      </Text>
                      <Text style={[styles.dot, { color: colors.mutedForeground }]}>•</Text>
                      <Text style={[styles.cardCat, { color: cc.color }]}>
                        {t(cc.labelKey)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.cardRight, { alignItems: isRTL ? "flex-start" : "flex-end" }]}>
                    <View style={[styles.badge, { backgroundColor: pc.color + "15" }]}>
                      <Feather name={pc.icon} size={9} color={pc.color} />
                      <Text style={[styles.badgeTxt, { color: pc.color }]}>{t(pc.labelKey)}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: sc.color + "15" }]}>
                      <Feather name={sc.icon} size={9} color={sc.color} />
                      <Text style={[styles.badgeTxt, { color: sc.color }]}>{t(sc.labelKey)}</Text>
                    </View>
                  </View>
                </View>
                <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>{fmtDate(ticket.date, lang)}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[styles.fab, { left: isRTL ? undefined : 20, right: isRTL ? 20 : undefined, flexDirection: rowDirection, backgroundColor: colors.primary }]}
        onPress={() => { setShowNew(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={20} color="#fff" />
        <Text style={styles.fabTxt}>{t("supportNewTicket")}</Text>
      </TouchableOpacity>

      {/* ═══════════════════════════════════════════════════════════════════════
          TICKET DETAIL MODAL
      ═══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <KeyboardAvoidingView
            style={[styles.modal, { backgroundColor: colors.background }]}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            {/* Modal header */}
            <View style={[styles.modalHdr, { flexDirection: rowDirection, paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]} numberOfLines={1}>
                 {t("supportTicketDetail")} #{selected.id.slice(-6).toUpperCase()}
              </Text>
              {isSyndicateAdmin && selected.status !== "resolved" ? (
                <TouchableOpacity
                  style={[styles.resolveBtn, { backgroundColor: colors.success }]}
                  onPress={() => handleResolve(selected.id)}
                >
                  <Feather name="check" size={12} color="#fff" />
                  <Text style={styles.resolveBtnTxt}>{t("supportResolveAction")}</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 72 }} />}
            </View>

            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Title */}
              <Text style={[styles.detailTitle, { color: colors.foreground }]}>{selected.title}</Text>

              {/* Badge row */}
              <View style={[styles.badgeRow, { flexDirection: rowDirection }]}>
                {[priCfg(selected.priority), stCfg(selected.status)].map((cfg, i) => (
                  <View key={i} style={[styles.chip, { backgroundColor: cfg.color + "15" }]}>
                    <Feather name={cfg.icon as any} size={11} color={cfg.color} />
                    <Text style={[styles.chipTxt, { color: cfg.color }]}>
                 {t(i === 0 ? (cfg as any).labelKey : (cfg as any).labelKey)}
                    </Text>
                  </View>
                ))}
                <View style={[styles.chip, { backgroundColor: catCfg(selected.category).color + "15" }]}>
                  <Feather name={catCfg(selected.category).icon} size={11} color={catCfg(selected.category).color} />
                  <Text style={[styles.chipTxt, { color: catCfg(selected.category).color }]}>
                    {t(catCfg(selected.category).labelKey)}
                  </Text>
                </View>
              </View>

              {/* Info grid */}
              <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: t("supportSubmittedBy"), value: selected.submittedBy },
                  { label: t("date"), value: fmtDate(selected.date, lang) },
                ].map((row, i) => (
                  <View key={row.label}>
                    {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                    <View style={[styles.infoRow, { flexDirection: rowDirection }]}>
                      <Text style={[styles.infoLbl, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[styles.infoVal, { color: colors.foreground, textAlign: isRTL ? "left" : "right" }]}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Description */}
              <View style={[styles.descBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.descLbl, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>{t("supportDescription")}</Text>
                <Text style={[styles.descTxt, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>{selected.description}</Text>
              </View>

              {/* ── Reply thread ── */}
              {repliesLoading ? (
                <View style={styles.threadState}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[styles.threadStateTxt, { color: colors.mutedForeground }]}>{t("supportConversationLoading")}</Text>
                </View>
              ) : repliesError ? (
                <View style={[styles.threadRecovery, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "30" }]}>
                  <Feather name="alert-circle" size={16} color={colors.destructive} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.threadStateTxt, { color: colors.foreground }]}>{t("supportConversationUnavailable")}</Text>
                    <Text style={[styles.threadRecoverySub, { color: colors.mutedForeground }]}>{t("supportConversationUnavailableDescription")}</Text>
                  </View>
                  <TouchableOpacity onPress={() => fetchReplies(selected.id)} accessibilityRole="button" accessibilityLabel={t("supportRetry")}>
                    <Feather name="refresh-cw" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              ) : replies.length > 0 && (
                <View style={{ gap: 10 }}>
                  <Text style={[styles.threadLbl, { color: colors.foreground }]}>
                    {t("supportConversation")} ({replies.length})
                  </Text>
                  {replies.map((rp) => {
                    const isAdmin = rp.authorName?.toLowerCase().includes("admin") ||
                      rp.authorId !== selected.submittedById;
                    return (
                      <View
                        key={rp.id}
                        style={[
                          styles.bubble,
                          isAdmin
                            ? [styles.bubbleAdmin, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]
                            : [styles.bubbleUser,  { backgroundColor: colors.card, borderColor: colors.border }],
                        ]}
                      >
                        <View style={[styles.bubbleHdr, { flexDirection: rowDirection }]}>
                          <Text style={[styles.bubbleAuthor, { color: isAdmin ? colors.primary : colors.foreground }]}>
                            {rp.authorName}
                          </Text>
                          <Text style={[styles.bubbleDate, { color: colors.mutedForeground }]}>
                            {fmtDate(rp.createdAt, lang)}
                          </Text>
                        </View>
                        <Text style={[styles.bubbleTxt, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>{rp.text}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* ── Reply input (admin can always reply; user can reply while open) ── */}
              {selected.status !== "resolved" && selected.status !== "closed" && (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.replyLbl, { color: colors.foreground }]}>
                    {isSyndicateAdmin ? t("supportReplyToTicket") : t("supportAddComment")}
                  </Text>
                  <TextInput
                    style={[styles.replyInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                    placeholder={t("supportWriteReply")}
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    numberOfLines={4}
                    value={replyText}
                    onChangeText={setReplyText}
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, {
                      backgroundColor: replyText.trim() && !replying ? colors.primary : colors.muted,
                    }]}
                    disabled={!replyText.trim() || replying}
                    onPress={handleReply}
                  >
                    {replying
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Feather name="send" size={14} color={replyText.trim() ? "#fff" : colors.mutedForeground} />
                    }
                    <Text style={[styles.sendBtnTxt, { color: replyText.trim() && !replying ? "#fff" : colors.mutedForeground }]}>
                      {t("supportSend")}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Resolved banner ── */}
              {(selected.status === "resolved" || selected.status === "closed") && (
                <View style={[styles.resolvedBanner, { flexDirection: rowDirection, backgroundColor: colors.success + "12", borderColor: colors.success + "30" }]}>
                  <Feather name="check-circle" size={18} color={colors.success} />
                  <Text style={[styles.resolvedTxt, { color: colors.success, textAlign: isRTL ? "right" : "left" }]}>
                     {t("supportResolvedBanner")}
                  </Text>
                </View>
              )}

              {/* ── Escalation button (syndicate_admin only, on open/in_progress tickets) ── */}
              {isSyndicateAdmin && !["resolved", "closed"].includes(selected.status) && (
                <TouchableOpacity
                  style={[styles.escalateBtn, { flexDirection: rowDirection, borderColor: "#1F5EFF" + "40", backgroundColor: "#1F5EFF" + "08" }]}
                  onPress={() => handleEscalate(selected)}
                  disabled={escalating}
                >
                  <Feather name="trending-up" size={16} color="#1F5EFF" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.escalateBtnTitle, { color: "#1F5EFF", textAlign: isRTL ? "right" : "left" }]}>
                      {escalating ? t("supportEscalating") : t("supportEscalateAction")}
                    </Text>
                    <Text style={[styles.escalateBtnSub, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>
                       {t("supportEscalateDescription")}
                    </Text>
                  </View>
                  <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={16} color="#1F5EFF" />
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          NEW TICKET MODAL
      ═══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={[styles.modal, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.modalHdr, { flexDirection: rowDirection, paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>{t("supportNewTicket")}</Text>
            <TouchableOpacity onPress={() => setShowNew(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Submitter info (pre-filled, read-only) */}
            <View style={[styles.prefilledCard, { flexDirection: rowDirection, backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="user" size={14} color={colors.primary} />
              <Text style={[styles.prefilledTxt, { color: colors.foreground }]}>
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>{t("supportSubmittedBy")} : </Text>
                {user?.name}
              </Text>
            </View>

            {/* Category selector */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLbl, { color: colors.foreground }]}>{t("supportCategory")} *</Text>
              <View style={[styles.chipGrid, { flexDirection: rowDirection }]}>
                {CATEGORIES.map((c) => {
                  const active = newCat === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.selectChip, {
                        backgroundColor: active ? c.color : colors.card,
                        borderColor:     active ? c.color : colors.border,
                        flexBasis:       "47%",
                      }]}
                      onPress={() => setNewCat(c.key)}
                    >
                      <Feather name={c.icon} size={13} color={active ? "#fff" : c.color} />
                      <Text style={[styles.selectChipTxt, { color: active ? "#fff" : c.color }]} numberOfLines={1}>
                         {t(c.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Priority selector */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLbl, { color: colors.foreground }]}>{t("ticketPriorityLabel")}</Text>
              <View style={[styles.chipRow, { flexDirection: rowDirection }]}>
                {PRIORITIES.map((p) => {
                  const active = newPri === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.selectChip, {
                        flex: 1,
                        backgroundColor: active ? p.color : colors.card,
                        borderColor:     active ? p.color : colors.border,
                      }]}
                      onPress={() => setNewPri(p.key)}
                    >
                      <Feather name={p.icon} size={13} color={active ? "#fff" : p.color} />
                      <Text style={[styles.selectChipTxt, { color: active ? "#fff" : p.color }]}>{t(p.labelKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Title */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLbl, { color: colors.foreground }]}>{t("supportSubject")} *</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder={
                   newCat === "paiement"      ? t("supportSubjectPaymentPlaceholder") :
                   newCat === "maintenance"   ? t("supportSubjectMaintenancePlaceholder") :
                   newCat === "juridique"     ? t("supportSubjectLegalPlaceholder") :
                   newCat === "administratif" ? t("supportSubjectAdministrativePlaceholder") :
                                                t("supportSubjectGeneralPlaceholder")
                }
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Description */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLbl, { color: colors.foreground }]}>{t("supportDescription")} *</Text>
              <TextInput
                style={[styles.fieldInput, styles.textArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}
                value={newDesc}
                onChangeText={setNewDesc}
                 placeholder={t("supportDescriptionPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={5}
              />
            </View>

            {/* Info note */}
            <View style={[styles.noteBox, { flexDirection: rowDirection, backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
              <Feather name="info" size={14} color={colors.primary} />
              <Text style={[styles.noteTxt, { color: colors.primary, textAlign: isRTL ? "right" : "left" }]}>
                {t("supportResponseNote")}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { flexDirection: rowDirection,
                backgroundColor: newTitle.trim() && newDesc.trim() && !submitting
                  ? colors.primary : colors.muted,
              }]}
              onPress={handleCreate}
              disabled={!newTitle.trim() || !newDesc.trim() || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Feather name="send" size={16} color={newTitle.trim() && newDesc.trim() ? "#fff" : colors.mutedForeground} />
              }
              <Text style={[styles.submitBtnTxt, {
                color: newTitle.trim() && newDesc.trim() && !submitting ? "#fff" : colors.mutedForeground,
              }]}>
                 {submitting ? t("supportSending") : t("supportSubmitRequest")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:        { flex: 1 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  recovery:    { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  header:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn:     { padding: 4 },
  title:       { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle:    { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  newBtn:      { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  infoBanner:  { flexDirection: "row", gap: 8, padding: 12, paddingHorizontal: 20, alignItems: "flex-start", borderBottomWidth: 1 },
  infoBannerText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 },
  statsStrip:  { flexDirection: "row", paddingVertical: 14, borderBottomWidth: 1 },
  statItem:    { flex: 1, alignItems: "center", gap: 2 },
  statVal:     { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLbl:     { fontSize: 10, fontFamily: "Inter_400Regular" },
  statDiv:     { width: 1 },
  filterRow:   { flexDirection: "row", padding: 10, paddingHorizontal: 16, gap: 8, borderBottomWidth: 1 },
  filterBtn:   { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  filterLbl:   { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty:       { alignItems: "center", gap: 12, paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:   { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle:  { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptySub:    { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  emptyBtn:    { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  emptyBtnTxt: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  card:        { borderRadius: 16, borderWidth: 1, borderLeftWidth: 4, padding: 14, gap: 8 },
  cardTop:     { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardIcon:    { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle:   { fontSize: 13, fontFamily: "Inter_700Bold" },
  cardMeta:    { flexDirection: "row", alignItems: "center", gap: 4 },
  cardBy:      { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardCat:     { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dot:         { fontSize: 10 },
  cardRight:   { alignItems: "flex-end", gap: 5 },
  badge:       { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  badgeTxt:    { fontSize: 9, fontFamily: "Inter_700Bold" },
  cardDate:    { fontSize: 11, fontFamily: "Inter_400Regular", marginStart: 54 },
  fab:         { position: "absolute", bottom: 24, left: 20, right: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16 },
  fabTxt:      { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  // Detail modal
  modal:       { flex: 1 },
  modalHdr:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle:  { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", marginHorizontal: 8 },
  resolveBtn:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  resolveBtnTxt: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  detailTitle: { fontSize: 17, fontFamily: "Inter_700Bold", lineHeight: 24 },
  badgeRow:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:        { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  chipTxt:     { fontSize: 11, fontFamily: "Inter_700Bold" },
  infoBox:     { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  sep:         { height: 1 },
  infoRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 },
  infoLbl:     { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoVal:     { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  descBox:     { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  descLbl:     { fontSize: 13, fontFamily: "Inter_700Bold" },
  descTxt:     { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  threadLbl:   { fontSize: 13, fontFamily: "Inter_700Bold" },
  threadState: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  threadStateTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  threadRecovery: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  threadRecoverySub: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  bubble:      { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  bubbleAdmin: {},
  bubbleUser:  {},
  bubbleHdr:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bubbleAuthor:{ fontSize: 12, fontFamily: "Inter_700Bold" },
  bubbleDate:  { fontSize: 10, fontFamily: "Inter_400Regular" },
  bubbleTxt:   { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  replyLbl:    { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyInput:  { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: "Inter_400Regular", minHeight: 100, textAlignVertical: "top" },
  sendBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  sendBtnTxt:  { fontSize: 14, fontFamily: "Inter_700Bold" },
  resolvedBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  resolvedTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  escalateBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  escalateBtnTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  escalateBtnSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 15 },
  // New ticket modal
  prefilledCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  prefilledTxt:  { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  fieldLbl:    { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput:  { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  textArea:    { minHeight: 110, textAlignVertical: "top" },
  chipRow:     { flexDirection: "row", gap: 8 },
  chipGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selectChip:  { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  selectChipTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  noteBox:     { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  noteTxt:     { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 },
  submitBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  submitBtnTxt:{ fontSize: 15, fontFamily: "Inter_700Bold" },
});

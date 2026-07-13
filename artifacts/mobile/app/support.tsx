import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
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
import { useData, type SupportTicket } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type Filter = "all" | "open" | "in_progress" | "resolved";

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { supportTickets, addSupportTicket, resolveTicket } = useData();
  const { t } = useLanguage();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [reply, setReply] = useState("");
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<SupportTicket["priority"]>("medium");
  const [newCategory, setNewCategory] = useState<SupportTicket["category"]>("general");

  const isAdmin = user?.role !== "member";
  const myTickets = isAdmin ? supportTickets : supportTickets.filter((tk) => tk.submittedBy === user?.name);
  const filtered = myTickets.filter((tk) => filter === "all" || tk.status === filter);

  const PRIORITIES: { key: SupportTicket["priority"]; label: string }[] = [
    { key: "high", label: t("priorityUrgent") },
    { key: "medium", label: t("priorityNormal") },
    { key: "low", label: t("priorityLow") },
  ];

  const CATEGORIES: { key: SupportTicket["category"]; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: "technique", label: t("catTechnique"), icon: "settings" },
    { key: "financier", label: t("catFinancial"), icon: "dollar-sign" },
    { key: "juridique", label: t("catLegal"), icon: "shield" },
    { key: "general", label: t("catGeneral"), icon: "help-circle" },
  ];

  const priorityConfig = (p: SupportTicket["priority"]) => ({
    high: { color: colors.destructive, label: t("priorityUrgent"), icon: "alert-circle" as const },
    medium: { color: "#f59e0b", label: t("priorityNormal"), icon: "alert-triangle" as const },
    low: { color: "#3b82f6", label: t("priorityLow"), icon: "info" as const },
  }[p]);

  const statusConfig = (s: SupportTicket["status"]) => ({
    open: { color: colors.destructive, label: t("ticketOpen"), icon: "alert-circle" as const },
    in_progress: { color: "#f59e0b", label: t("ticketInProgress"), icon: "clock" as const },
    resolved: { color: colors.success, label: t("ticketResolved"), icon: "check-circle" as const },
    closed: { color: colors.mutedForeground, label: t("ticketClosed"), icon: "x-circle" as const },
  }[s]);

  const catConfig = (c: SupportTicket["category"]) => ({
    technique: { icon: "settings" as const, color: "#3b82f6" },
    financier: { icon: "dollar-sign" as const, color: colors.success },
    juridique: { icon: "shield" as const, color: "#8b5cf6" },
    general: { icon: "help-circle" as const, color: "#f59e0b" },
  }[c]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: t("filterAllTickets") },
    { key: "open", label: t("filterOpen") },
    { key: "in_progress", label: t("ticketInProgress") },
    { key: "resolved", label: t("filterResolved") },
  ];

  const handleCreateTicket = () => {
    if (!newTitle.trim() || !newDesc.trim()) return;
    const ticket: SupportTicket = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      description: newDesc.trim(),
      submittedBy: user?.name ?? "Utilisateur",
      syndicate: user?.syndicate ?? "SNE",
      priority: newPriority,
      status: "open",
      date: new Date().toISOString().slice(0, 10),
      category: newCategory,
    };
    addSupportTicket(ticket);
    setShowNew(false);
    setNewTitle(""); setNewDesc(""); setNewPriority("medium"); setNewCategory("general");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const openCount = myTickets.filter((tk) => tk.status === "open").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isAdmin ? "Tickets Support" : "Mon Support"}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {openCount > 0 ? `${openCount} ouvert(s)` : t("ticketResolved")}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => { setShowNew(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats strip */}
      <View style={[styles.statsStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: t("filterOpen"), count: myTickets.filter((tk) => tk.status === "open").length, color: colors.destructive },
          { label: t("ticketInProgress"), count: myTickets.filter((tk) => tk.status === "in_progress").length, color: "#f59e0b" },
          { label: t("filterResolved"), count: myTickets.filter((tk) => tk.status === "resolved").length, color: colors.success },
          { label: "Total", count: myTickets.length, color: colors.primary },
        ].map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 ? <View style={[styles.statDiv, { backgroundColor: colors.border }]} /> : null}
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.count}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Filters */}
      <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, { backgroundColor: filter === f.key ? colors.primary : "transparent" }]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterLabel, { color: filter === f.key ? "#fff" : colors.mutedForeground }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(tk) => tk.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "12" }]}>
              <Feather name="inbox" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noTickets")}</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {filter === "all"
                ? t("noTickets")
                : `${t("noTickets")} ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}.`}
            </Text>
            {filter === "all" ? (
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                onPress={() => { setShowNew(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Feather name="plus" size={14} color="#fff" />
                <Text style={styles.emptyBtnText}>{t("newTicket")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        renderItem={({ item: ticket }) => {
          const pc = priorityConfig(ticket.priority);
          const sc = statusConfig(ticket.status);
          const cc = catConfig(ticket.category);
          return (
            <TouchableOpacity
              style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: pc.color }]}
              onPress={() => { setSelected(ticket); setReply(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.75}
            >
              <View style={styles.ticketTop}>
                <View style={[styles.ticketIcon, { backgroundColor: cc.color + "15" }]}>
                  <Feather name={cc.icon} size={18} color={cc.color} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.ticketTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {ticket.title}
                  </Text>
                  <View style={styles.ticketMeta}>
                    <Text style={[styles.ticketSyndicate, { color: colors.primary }]} numberOfLines={1}>
                      {ticket.syndicate}
                    </Text>
                    <Text style={[styles.ticketDot, { color: colors.mutedForeground }]}>•</Text>
                    <Text style={[styles.ticketBy, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {ticket.submittedBy}
                    </Text>
                  </View>
                </View>
                <View style={styles.ticketRight}>
                  <View style={[styles.priorityBadge, { backgroundColor: pc.color + "15" }]}>
                    <Feather name={pc.icon} size={10} color={pc.color} />
                    <Text style={[styles.priorityText, { color: pc.color }]}>{pc.label}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc.color + "15" }]}>
                    <Feather name={sc.icon} size={10} color={sc.color} />
                    <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                </View>
              </View>
              <Text style={[styles.ticketDate, { color: colors.mutedForeground }]}>{ticket.date}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* FAB — create ticket */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => { setShowNew(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={22} color="#fff" />
        <Text style={styles.fabText}>{t("newTicket")}</Text>
      </TouchableOpacity>

      {/* Ticket detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                {`Ticket #${selected.id}`}
              </Text>
              {isAdmin && selected.status !== "resolved" ? (
                <TouchableOpacity
                  style={[styles.resolveBtn, { backgroundColor: colors.success }]}
                  onPress={() => {
                    resolveTicket(selected.id);
                    setSelected(null);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                >
                  <Feather name="check" size={13} color="#fff" />
                  <Text style={styles.resolveBtnText}>{t("ticketResolved")}</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 80 }} />}
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {/* Title + badges */}
              <Text style={[styles.detailTitle, { color: colors.foreground }]}>{selected.title}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.chip, { backgroundColor: priorityConfig(selected.priority).color + "15" }]}>
                  <Feather name={priorityConfig(selected.priority).icon} size={11} color={priorityConfig(selected.priority).color} />
                  <Text style={[styles.chipText, { color: priorityConfig(selected.priority).color }]}>
                    {priorityConfig(selected.priority).label}
                  </Text>
                </View>
                <View style={[styles.chip, { backgroundColor: statusConfig(selected.status).color + "15" }]}>
                  <Feather name={statusConfig(selected.status).icon} size={11} color={statusConfig(selected.status).color} />
                  <Text style={[styles.chipText, { color: statusConfig(selected.status).color }]}>
                    {statusConfig(selected.status).label}
                  </Text>
                </View>
                <View style={[styles.chip, { backgroundColor: catConfig(selected.category).color + "15" }]}>
                  <Feather name={catConfig(selected.category).icon} size={11} color={catConfig(selected.category).color} />
                  <Text style={[styles.chipText, { color: catConfig(selected.category).color }]}>
                    {CATEGORIES.find((c) => c.key === selected.category)?.label}
                  </Text>
                </View>
              </View>

              {/* Info card */}
              <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Syndicat", value: selected.syndicate },
                  { label: "Soumis par", value: selected.submittedBy },
                  { label: t("dateLabel") ?? "Date", value: selected.date },
                ].map((info, i) => (
                  <View key={info.label}>
                    {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{info.label}</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{info.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Description */}
              <View style={[styles.descBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.descLabel, { color: colors.foreground }]}>{t("ticketDescLabel")}</Text>
                <Text style={[styles.descText, { color: colors.mutedForeground }]}>{selected.description}</Text>
              </View>

              {/* Reply (admin only) */}
              {isAdmin && selected.status !== "resolved" ? (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.replyLabel, { color: colors.foreground }]}>{t("replyLabel")}</Text>
                  <TextInput
                    style={[styles.replyInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                    placeholder={t("replyInputPlaceholder")}
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    numberOfLines={4}
                    value={reply}
                    onChangeText={setReply}
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, { backgroundColor: reply.trim() ? colors.primary : colors.muted }]}
                    disabled={!reply.trim()}
                    onPress={() => {
                      setReply("");
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }}
                  >
                    <Feather name="send" size={15} color={reply.trim() ? "#fff" : colors.mutedForeground} />
                    <Text style={[styles.sendBtnText, { color: reply.trim() ? "#fff" : colors.mutedForeground }]}>
                      {t("sendReply")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : selected.status === "resolved" ? (
                <View style={[styles.resolvedBanner, { backgroundColor: colors.success + "12", borderColor: colors.success + "30" }]}>
                  <Feather name="check-circle" size={18} color={colors.success} />
                  <Text style={[styles.resolvedText, { color: colors.success }]}>{t("ticketResolvedMsg")}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* New ticket modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("newTicket")}</Text>
            <TouchableOpacity onPress={() => setShowNew(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {/* Title */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("ticketTitleLabel")} *</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Décrivez brièvement le problème"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Description */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("ticketDescLabel")} *</Text>
              <TextInput
                style={[styles.fieldInput, styles.textArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="Décrivez votre problème en détail..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={5}
              />
            </View>

            {/* Priority */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Priorité</Text>
              <View style={styles.chipRow}>
                {PRIORITIES.map((p) => {
                  const pc = priorityConfig(p.key);
                  const active = newPriority === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.selectChip, {
                        backgroundColor: active ? pc.color : colors.card,
                        borderColor: active ? pc.color : colors.border,
                      }]}
                      onPress={() => setNewPriority(p.key)}
                    >
                      <Feather name={pc.icon} size={13} color={active ? "#fff" : pc.color} />
                      <Text style={[styles.selectChipText, { color: active ? "#fff" : pc.color }]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Category */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Catégorie</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map((c) => {
                  const cc = catConfig(c.key);
                  const active = newCategory === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.selectChip, {
                        backgroundColor: active ? cc.color : colors.card,
                        borderColor: active ? cc.color : colors.border,
                      }]}
                      onPress={() => setNewCategory(c.key)}
                    >
                      <Feather name={cc.icon} size={13} color={active ? "#fff" : cc.color} />
                      <Text style={[styles.selectChipText, { color: active ? "#fff" : cc.color }]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Info note */}
            <View style={[styles.noteBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
              <Feather name="info" size={14} color={colors.primary} />
              <Text style={[styles.noteText, { color: colors.primary }]}>
                {t("supportTeamNote")}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: newTitle.trim() && newDesc.trim() ? colors.primary : colors.muted }]}
              onPress={handleCreateTicket}
              disabled={!newTitle.trim() || !newDesc.trim()}
            >
              <Feather name="send" size={16} color={newTitle.trim() && newDesc.trim() ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.submitBtnText, { color: newTitle.trim() && newDesc.trim() ? "#fff" : colors.mutedForeground }]}>
                {t("submitTicket")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  newBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statsStrip: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: 1 },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  statDiv: { width: 1 },
  filterRow: { flexDirection: "row", padding: 10, paddingHorizontal: 16, gap: 8, borderBottomWidth: 1 },
  filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  filterLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", gap: 12, paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  emptyBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  ticketCard: { borderRadius: 16, borderWidth: 1, borderLeftWidth: 4, padding: 14, gap: 8 },
  ticketTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  ticketIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  ticketTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  ticketMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  ticketSyndicate: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  ticketDot: { fontSize: 10 },
  ticketBy: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ticketRight: { alignItems: "flex-end", gap: 5 },
  priorityBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  priorityText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  ticketDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginStart: 54 },
  fab: { position: "absolute", bottom: 24, left: 20, right: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16 },
  fabText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold" },
  resolveBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  resolveBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  detailTitle: { fontSize: 17, fontFamily: "Inter_700Bold", lineHeight: 24 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, flexShrink: 0 },
  chipText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  infoBox: { borderRadius: 14, borderWidth: 1, padding: 4 },
  sep: { height: 1, marginHorizontal: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  descBox: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  descLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  descText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  replyLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: "Inter_400Regular", minHeight: 100, textAlignVertical: "top" },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  sendBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  resolvedBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  resolvedText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  textArea: { minHeight: 110, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selectChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  selectChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  noteBox: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { announcements, type ApiAnnouncement } from "@/services/api";
import { useToast } from "@/context/ToastContext";
import EmptyState from "@/components/EmptyState";
import FilterChips from "@/components/FilterChips";

type Priority = ApiAnnouncement["priority"];

type PriorityConfig = { color: string; label: string; icon: keyof typeof Feather.glyphMap; bg: string };

const FALLBACK_PRIORITY: PriorityConfig = { color: "#3b82f6", label: "Info", icon: "info", bg: "#3b82f615" };

function getPriorityConfig(t: (key: string) => string): Record<string, PriorityConfig> {
  return {
    urgent:    { color: "#ef4444", label: t("priorityUrgent"),    icon: "alert-circle",   bg: "#ef444415" },
    important: { color: "#f59e0b", label: t("priorityImportant"), icon: "alert-triangle", bg: "#f59e0b15" },
    info:      { color: "#3b82f6", label: t("priorityInfo"),       icon: "info",           bg: "#3b82f615" },
    normal:    { color: "#3b82f6", label: t("priorityInfo"),       icon: "info",           bg: "#3b82f615" },
  };
}

function getPc(config: Record<string, PriorityConfig>, priority: string): PriorityConfig {
  return config[priority] ?? FALLBACK_PRIORITY;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days}j`;
}

export default function AnnoncesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const queryClient = useQueryClient();
  const isAdmin = user?.role !== "member";
  const { showToast } = useToast();

  const PRIORITY_CONFIG = getPriorityConfig(t);

  const [selected, setSelected] = useState<ApiAnnouncement | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all");

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("info");
  const [newAudience, setNewAudience] = useState("Tous les membres");
  const [newPinned, setNewPinned] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => announcements.list(),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (d: Parameters<typeof announcements.create>[0]) => announcements.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setShowCreate(false);
      setNewTitle(""); setNewBody(""); setNewPriority("info");
      setNewAudience("Tous les membres"); setNewPinned(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("publishAnnouncement"), message: "L'annonce a été publiée et est visible par les membres." });
    },
    onError: (err: Error) => showToast({ type: "error", title: "Erreur", message: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcements.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setSelected(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => showToast({ type: "error", title: "Erreur", message: err.message }),
  });

  const allAnnonces = data?.data ?? [];
  const filtered = filterPriority === "all"
    ? allAnnonces
    : allAnnonces.filter((a) => a.priority === filterPriority);
  const pinned = filtered.filter((a) => a.pinned);
  const regular = filtered.filter((a) => !a.pinned);
  const sortedList = [...pinned, ...regular];

  const handleCreate = () => {
    if (!newTitle.trim() || !newBody.trim()) {
      showToast({ type: "warning", title: t("requiredFields"), message: "Le titre et le corps sont obligatoires." });
      return;
    }
    createMutation.mutate({
      title: newTitle.trim(),
      body: newBody.trim(),
      priority: newPriority,
      audience: newAudience,
      pinned: newPinned,
    });
  };

  const handleDelete = (a: ApiAnnouncement) => {
    Alert.alert(
      t("confirmDeleteTitle"),
      `${t("deleteAnnouncement")} "${a.title}"?`,
      [
        { text: "Annuler", style: "cancel" },
        { text: t("deleteAnnouncement"), style: "destructive", onPress: () => deleteMutation.mutate(a.id) },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("announcesTitle")}</Text>
        </View>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Chargement des annonces...</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("announcesTitle")}</Text>
        </View>
        <View style={styles.centerState}>
          <Feather name="wifi-off" size={40} color={colors.destructive} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Impossible de charger les annonces</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("announcesTitle")}</Text>
          <Text style={styles.headerSub}>{allAnnonces.length} annonce(s)</Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      <FilterChips
        options={[
          { key: "all",       label: t("filterToutes"),    color: colors.primary },
          { key: "urgent",    label: t("priorityUrgent"),  color: "#ef4444", icon: "alert-circle" },
          { key: "important", label: t("priorityImportant"), color: "#f59e0b", icon: "alert-triangle" },
          { key: "info",      label: t("priorityInfo"),    color: "#3b82f6", icon: "info" },
        ]}
        value={filterPriority}
        onChange={(k) => setFilterPriority(k as Priority | "all")}
        accentColor={colors.primary}
        mode="equal"
      />

      <FlatList
        data={sortedList}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="bell-off"
            title={t("noAnnouncementsYet")}
            description="Aucune annonce pour cette catégorie de priorité."
            actionLabel={isAdmin ? t("createAnnouncement") : undefined}
            onAction={isAdmin ? () => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } : undefined}
          />
        }
        renderItem={({ item: a }) => {
          const pc = getPc(PRIORITY_CONFIG, a.priority);
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: pc.color }]}
              onPress={() => { setSelected(a); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconBox, { backgroundColor: pc.bg }]}>
                  <Feather name={pc.icon} size={18} color={pc.color} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.titleRow}>
                    {a.pinned ? <Feather name="bookmark" size={13} color={colors.primary} /> : null}
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{a.title}</Text>
                  </View>
                  <Text style={[styles.cardBody, { color: colors.mutedForeground }]} numberOfLines={2}>{a.body}</Text>
                </View>
              </View>

              <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                <View style={[styles.priorityBadge, { backgroundColor: pc.bg }]}>
                  <Text style={[styles.priorityText, { color: pc.color }]}>{pc.label}</Text>
                </View>
                <View style={styles.footerMeta}>
                  <Feather name="user" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{a.author}</Text>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>·</Text>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{timeAgo(a.createdAt)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={{ flex: 1, marginStart: 12 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={2}>{selected.title}</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>{selected.audience}</Text>
              </View>
              {isAdmin ? (
                <TouchableOpacity
                  onPress={() => { setSelected(null); handleDelete(selected); }}
                  style={[styles.deleteBtn, { backgroundColor: colors.destructive + "15" }]}
                >
                  <Feather name="trash-2" size={16} color={colors.destructive} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              <View style={[styles.priorityBanner, { backgroundColor: getPc(PRIORITY_CONFIG, selected.priority).bg, borderColor: getPc(PRIORITY_CONFIG, selected.priority).color + "40" }]}>
                <Feather name={getPc(PRIORITY_CONFIG, selected.priority).icon} size={16} color={getPc(PRIORITY_CONFIG, selected.priority).color} />
                <Text style={[styles.priorityBannerText, { color: getPc(PRIORITY_CONFIG, selected.priority).color }]}>
                  {getPc(PRIORITY_CONFIG, selected.priority).label}
                  {selected.pinned ? ` · ${t("announcePinned")}` : ""}
                </Text>
              </View>

              <View style={[styles.bodyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.bodyText, { color: colors.foreground }]}>{selected.body}</Text>
              </View>

              <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { icon: "user" as const, label: t("authorLabel"), value: selected.author },
                  { icon: "users" as const, label: t("audienceLabel"), value: selected.audience },
                  { icon: "clock" as const, label: t("publishedOn"), value: new Date(selected.createdAt).toLocaleDateString("fr-MA", { day: "numeric", month: "long", year: "numeric" }) },
                  ...(selected.expiresAt ? [{ icon: "calendar" as const, label: t("expiresOn"), value: new Date(selected.expiresAt).toLocaleDateString("fr-MA") }] : []),
                ].map((row) => (
                  <View key={row.label} style={[styles.metaRow, { borderBottomColor: colors.border }]}>
                    <Feather name={row.icon} size={14} color={colors.primary} />
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                    <Text style={[styles.metaValue, { color: colors.foreground }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("createAnnouncement")}</Text>
              <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Publiée immédiatement aux membres</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Priorité</Text>
              <View style={styles.priorityRow}>
                {(["info", "important", "urgent"] as Priority[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityChip,
                      { borderColor: newPriority === p ? PRIORITY_CONFIG[p].color : colors.border },
                      newPriority === p ? { backgroundColor: PRIORITY_CONFIG[p].color } : { backgroundColor: colors.background },
                    ]}
                    onPress={() => { setNewPriority(p); Haptics.selectionAsync(); }}
                  >
                    <Feather name={PRIORITY_CONFIG[p].icon} size={13} color={newPriority === p ? "#fff" : colors.mutedForeground} />
                    <Text style={[styles.priorityChipText, { color: newPriority === p ? "#fff" : colors.mutedForeground }]}>
                      {PRIORITY_CONFIG[p].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("annFormTitle")} *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Assemblée Générale du 15 juillet"
                placeholderTextColor={colors.mutedForeground}
                value={newTitle}
                onChangeText={setNewTitle}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("annFormContent")} *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, height: 120, textAlignVertical: "top" }]}
                placeholder="Rédigez votre annonce..."
                placeholderTextColor={colors.mutedForeground}
                value={newBody}
                onChangeText={setNewBody}
                multiline
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("audienceLabel")}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Tous les membres"
                placeholderTextColor={colors.mutedForeground}
                value={newAudience}
                onChangeText={setNewAudience}
              />
            </View>

            <TouchableOpacity
              style={[styles.pinnedToggle, { borderColor: colors.border, backgroundColor: newPinned ? colors.primary + "10" : colors.card }]}
              onPress={() => { setNewPinned(!newPinned); Haptics.selectionAsync(); }}
            >
              <Feather name={newPinned ? "bookmark" : "bookmark"} size={16} color={newPinned ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.pinnedText, { color: newPinned ? colors.primary : colors.foreground }]}>
                {newPinned ? t("announcePinned") : t("announcePinned")}
              </Text>
              <Feather name={newPinned ? "toggle-right" : "toggle-left"} size={20} color={newPinned ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.publishBtn,
                { backgroundColor: newTitle.trim() && newBody.trim() ? colors.primary : colors.muted },
              ]}
              onPress={handleCreate}
              disabled={!newTitle.trim() || !newBody.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="send" size={16} color={newTitle.trim() && newBody.trim() ? "#fff" : colors.mutedForeground} />
              )}
              <Text style={[styles.publishBtnText, { color: newTitle.trim() && newBody.trim() ? "#fff" : colors.mutedForeground }]}>
                {createMutation.isPending ? "Publication..." : t("publishAnnouncement")}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    overflow: "hidden",
    gap: 0,
  },
  cardTop: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    paddingBottom: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, flexWrap: "wrap" },
  cardTitle: { fontSize: 13, fontFamily: "Inter_700Bold", flex: 1 },
  cardBody: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  priorityText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  footerMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40, paddingTop: 80 },
  stateText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    gap: 4,
  },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  priorityBannerText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  bodyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  bodyText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  metaCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderBottomWidth: 1,
  },
  metaLabel: { fontSize: 12, fontFamily: "Inter_400Regular", width: 90 },
  metaValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  priorityRow: { flexDirection: "row", gap: 8 },
  priorityChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  priorityChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  pinnedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  pinnedText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 4,
  },
  publishBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

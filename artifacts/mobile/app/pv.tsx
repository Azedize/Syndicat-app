import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import EmptyState from "@/components/EmptyState";
import FilterChips from "@/components/FilterChips";
import StatisticsHeader from "@/components/StatisticsHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";

type PVType = "bureau" | "ag" | "commission" | "election" | "urgence";
type PVStatus = "draft" | "pending" | "published";

interface PV {
  id: string;
  title: string;
  type: PVType;
  status: PVStatus;
  date: string;
  redacteur: string;
  presences: number;
  summary: string;
  resolutions: string[];
  signataires: string[];
}

const TYPE_CONFIG_META: Record<
  PVType,
  { key: string; icon: keyof typeof Feather.glyphMap; color: string }
> = {
  bureau: { key: "pvTypeBureau", icon: "briefcase", color: "#2563EB" },
  ag: { key: "pvTypeAG", icon: "users", color: "#3b82f6" },
  commission: { key: "pvTypeCommission", icon: "layers", color: "#10b981" },
  election: { key: "pvTypeElection", icon: "check-square", color: "#f59e0b" },
  urgence: { key: "pvTypeUrgence", icon: "alert-triangle", color: "#ef4444" },
};

const STATUS_CONFIG_META: Record<
  PVStatus,
  { key: string; color: string; bg: string }
> = {
  draft: { key: "pvStatusDraft", color: "#6b7280", bg: "#6b728018" },
  pending: { key: "pvStatusPending", color: "#f59e0b", bg: "#f59e0b18" },
  published: { key: "pvStatusPublished", color: "#10b981", bg: "#10b98118" },
};

// ─── API mapping ──────────────────────────────────────────────────────────────

const MEETING_TYPE_TO_PV: Record<string, PVType> = {
  ag_ordinaire: "ag",
  ag_extraordinaire: "ag",
  ag_constitutive: "ag",
  general: "ag",
  ag_elective: "election",
};

const MEETING_STATUS_TO_PV: Record<string, PVStatus> = {
  completed: "published",
  scheduled: "pending",
  in_progress: "pending",
  cancelled: "draft",
};

function meetingToPV(m: any): PV {
  const rawDesc = (m.description ?? "")
    .replace(/\n__meta:\{[^}]*\}/, "")
    .replace(/\n__membres_presents:\d+/, "")
    .trim();
  return {
    id: m.id,
    title: m.title,
    type: MEETING_TYPE_TO_PV[m.type] ?? "ag",
    status: MEETING_STATUS_TO_PV[m.status] ?? "pending",
    date: m.date ?? "",
    redacteur: m.createdByName ?? "Syndic",
    presences: m.attendeesCount ?? 0,
    summary: rawDesc || m.agenda || m.title || "",
    resolutions: (m.resolutions ?? []).map((r: any) => {
      const badge =
        r.result === "adopted" ? " ✓" : r.result === "rejected" ? " ✗" : "";
      return `${r.title}${badge}`;
    }),
    signataires: [],
  };
}

const FILTER_TYPES: { key: "all" | PVType; labelKey: string }[] = [
  { key: "all", labelKey: "pvFilterAll" },
  { key: "bureau", labelKey: "pvTypeBureau" },
  { key: "ag", labelKey: "pvTypeAG" },
  { key: "commission", labelKey: "pvTypeCommission" },
  { key: "election", labelKey: "pvTypeElection" },
  { key: "urgence", labelKey: "pvTypeUrgence" },
];

// Procès-verbaux d'AG relèvent de la gouvernance des copropriétaires ; hors périmètre locataire.
export default function PVScreen() {
  return (
    <RoleGuard
      allow={[
        "super_admin",
        "syndicate_admin",
        "president",
        "secretary",
        "committee_member",
        "member",
      ]}
    >
      <PVScreenInner />
    </RoleGuard>
  );
}

function PVScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  // Secretary writes PVs; President signs them. Both need admin-level PV access.
  // super_admin is excluded — they never manage syndicate documents directly.
  const isAdmin =
    user?.role === "syndicate_admin" ||
    user?.role === "secretary" ||
    user?.role === "president";

  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const [pvList, setPVList] = useState<PV[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | PVType>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | PVStatus>("all");
  const [selectedPV, setSelectedPV] = useState<PV | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<PVType>("ag");
  const [newSummary, setNewSummary] = useState("");
  const [newResolution, setNewResolution] = useState("");
  const [newResolutions, setNewResolutions] = useState<string[]>([]);

  const fetchPVs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ data: any[] }>("/ag-meetings");
      setPVList((res.data ?? []).map(meetingToPV));
    } catch {
      // keep empty list — network error handled silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPVs();
  }, [fetchPVs]);

  const filtered = pvList.filter((p) => {
    const matchType = filterType === "all" || p.type === filterType;
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchType && matchStatus;
  });

  const handlePublish = (id: string) => {
    Alert.alert(t("pvPublishTitle"), t("pvPublishConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("pvPublishBtn"),
        onPress: () => {
          setPVList((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, status: "published" as const } : p,
            ),
          );
          setSelectedPV((prev) =>
            prev ? { ...prev, status: "published" } : null,
          );
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const handleShare = async (pv: PV) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      title: pv.title,
      message: `${pv.title}\nDate: ${pv.date}\n\n${t("pvSummaryLabel")}: ${pv.summary}\n\n${t("pvResolutionsLabel")}:\n${pv.resolutions.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
    });
  };

  const handleAddResolution = () => {
    if (!newResolution.trim()) return;
    setNewResolutions((prev) => [...prev, newResolution.trim()]);
    setNewResolution("");
  };

  const MEETING_TYPE_MAP: Record<PVType, string> = {
    ag: "ag_ordinaire",
    election: "ag_elective",
    bureau: "general",
    commission: "general",
    urgence: "general",
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newSummary.trim() || creating) return;
    setCreating(true);
    try {
      await apiRequest("/ag-meetings", "POST", {
        title: newTitle.trim(),
        type: MEETING_TYPE_MAP[newType],
        description: newSummary.trim(),
        agenda: newResolutions.join("\n"),
        date: new Date().toISOString().slice(0, 10),
      });
      await fetchPVs();
      setShowCreate(false);
      setNewTitle("");
      setNewSummary("");
      setNewResolutions([]);
      setNewResolution("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert(t("error"), err.message ?? t("pvCreateError"));
    } finally {
      setCreating(false);
    }
  };

  const publishedCount = pvList.filter((p) => p.status === "published").length;
  const draftCount = pvList.filter(
    (p) => p.status === "draft" || p.status === "pending",
  ).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t("pvTitle")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {publishedCount}{" "}
            {publishedCount > 1
              ? t("pvPublishedCountPl")
              : t("pvPublishedCount")}
            {draftCount > 0 ? ` · ${draftCount} ${t("pvInProgressCount")}` : ""}
          </Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setShowCreate(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      <FilterChips
        options={FILTER_TYPES.map((f) => ({
          key: f.key,
          label: t(f.labelKey),
        }))}
        value={filterType}
        onChange={(k) => setFilterType(k as "all" | PVType)}
        mode="scroll"
      />
      <FilterChips
        options={[
          { key: "all", label: t("pvFilterAllStatus"), color: "#6b7280" },
          { key: "published", label: t("pvFilterPublished"), color: "#10b981" },
          { key: "draft", label: t("pvFilterDraft"), color: "#6b7280" },
        ]}
        value={filterStatus}
        onChange={(k) => setFilterStatus(k as "all" | PVStatus)}
        accentColor="#6b7280"
        mode="equal"
      />

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: insets.bottom + 80,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <EmptyState
              icon="file-text"
              title={t("pvNoneMatching")}
              description={
                isAdmin
                  ? "Créez un nouveau procès-verbal pour commencer."
                  : "Aucun procès-verbal disponible pour le moment."
              }
              actionLabel={isAdmin ? t("pvNewTitle") : undefined}
              onAction={
                isAdmin
                  ? () => {
                      setShowCreate(true);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  : undefined
              }
            />
          )
        }
        renderItem={({ item: pv }) => {
          const tc = TYPE_CONFIG_META[pv.type];
          const sc = STATUS_CONFIG_META[pv.status];
          return (
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor:
                    pv.status === "draft" ? colors.border : tc.color + "40",
                },
              ]}
              onPress={() => {
                setSelectedPV(pv);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.8}
            >
              <View
                style={[styles.cardIcon, { backgroundColor: tc.color + "15" }]}
              >
                <Feather name={tc.icon} size={18} color={tc.color} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={[styles.cardTitle, { color: colors.foreground }]}
                  numberOfLines={2}
                >
                  {pv.title}
                </Text>
                <View style={styles.cardMeta}>
                  <Feather
                    name="calendar"
                    size={11}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.cardMetaText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {pv.date}
                  </Text>
                  <Text
                    style={[
                      styles.cardMetaDot,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    ·
                  </Text>
                  <Feather
                    name="users"
                    size={11}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.cardMetaText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {pv.presences} {t("pvPresences")}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: tc.color + "18" },
                    ]}
                  >
                    <Text style={[styles.typeBadgeText, { color: tc.color }]}>
                      {t(tc.key)}
                    </Text>
                  </View>
                  <View
                    style={[styles.statusBadge, { backgroundColor: sc.bg }]}
                  >
                    <Text style={[styles.statusBadgeText, { color: sc.color }]}>
                      {t(sc.key)}
                    </Text>
                  </View>
                </View>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          );
        }}
      />

      {/* PV Detail Modal */}
      <Modal
        visible={!!selectedPV}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        {selectedPV ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <TouchableOpacity onPress={() => setSelectedPV(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.foreground, flex: 1, marginStart: 12 },
                ]}
                numberOfLines={2}
              >
                {selectedPV.title}
              </Text>
              <TouchableOpacity
                style={[styles.shareBtn, { backgroundColor: colors.secondary }]}
                onPress={() => handleShare(selectedPV)}
              >
                <Feather name="share" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={{
                padding: 20,
                gap: 16,
                paddingBottom: 40,
              }}
            >
              {/* Hero banner */}
              {(() => {
                const tc = TYPE_CONFIG_META[selectedPV.type];
                const sc = STATUS_CONFIG_META[selectedPV.status];
                return (
                  <View
                    style={[
                      styles.pvHero,
                      {
                        backgroundColor: tc.color + "12",
                        borderColor: tc.color + "30",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.pvHeroIcon,
                        { backgroundColor: tc.color + "20" },
                      ]}
                    >
                      <Feather name={tc.icon} size={24} color={tc.color} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.pvHeroRow}>
                        <View
                          style={[
                            styles.typeBadge,
                            { backgroundColor: tc.color + "25" },
                          ]}
                        >
                          <Text
                            style={[styles.typeBadgeText, { color: tc.color }]}
                          >
                            {t(tc.key)}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: sc.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: sc.color },
                            ]}
                          >
                            {t(sc.key)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.pvHeroMeta}>
                        <Feather name="calendar" size={11} color={tc.color} />
                        <Text
                          style={[styles.pvHeroMetaText, { color: tc.color }]}
                        >
                          {selectedPV.date}
                        </Text>
                        <Text
                          style={[styles.pvHeroMetaText, { color: tc.color }]}
                        >
                          ·
                        </Text>
                        <Feather name="users" size={11} color={tc.color} />
                        <Text
                          style={[styles.pvHeroMetaText, { color: tc.color }]}
                        >
                          {selectedPV.presences} présences
                        </Text>
                      </View>
                      <View style={styles.pvHeroMeta}>
                        <Feather name="edit-2" size={11} color={tc.color} />
                        <Text
                          style={[styles.pvHeroMetaText, { color: tc.color }]}
                        >
                          {t("pvRedacteur")}: {selectedPV.redacteur}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}

              {/* Summary */}
              <View
                style={[
                  styles.section,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {t("pvSummaryLabel")}
                </Text>
                <Text
                  style={[styles.sectionBody, { color: colors.foreground }]}
                >
                  {selectedPV.summary}
                </Text>
              </View>

              {/* Resolutions */}
              <View
                style={[
                  styles.section,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {t("pvResolutionsLabel")}
                </Text>
                {selectedPV.resolutions.map((r, i) => (
                  <View key={i} style={styles.resolutionRow}>
                    <View
                      style={[
                        styles.resolutionNum,
                        { backgroundColor: colors.primary + "15" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.resolutionNumText,
                          { color: colors.primary },
                        ]}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.resolutionText,
                        { color: colors.foreground },
                      ]}
                    >
                      {r}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Signataires */}
              {selectedPV.signataires.length > 0 ? (
                <View
                  style={[
                    styles.section,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sectionLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("pvSignatairesLabel")}
                  </Text>
                  {selectedPV.signataires.map((s, i) => (
                    <View key={i} style={styles.sigRow}>
                      <View
                        style={[
                          styles.sigAvatar,
                          { backgroundColor: colors.primary + "15" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sigInitials,
                            { color: colors.primary },
                          ]}
                        >
                          {s
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </Text>
                      </View>
                      <Text
                        style={[styles.sigName, { color: colors.foreground }]}
                      >
                        {s}
                      </Text>
                      {selectedPV.status === "published" ? (
                        <Feather
                          name="check-circle"
                          size={15}
                          color="#10b981"
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={() => {
                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success,
                    );
                    Alert.alert(
                      t("pvDownloadTitle"),
                      `"${selectedPV.title}" ${t("pvDownloadedSuffix")}`,
                    );
                  }}
                >
                  <Feather name="download" size={15} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: "#fff" }]}>
                    {t("pvDownloadPDF")}
                  </Text>
                </TouchableOpacity>
                {isAdmin && selectedPV.status !== "published" ? (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: "#10b98118",
                        borderWidth: 1,
                        borderColor: "#10b98140",
                      },
                    ]}
                    onPress={() => handlePublish(selectedPV.id)}
                  >
                    <Feather name="globe" size={15} color="#10b981" />
                    <Text style={[styles.actionBtnText, { color: "#10b981" }]}>
                      {t("pvPublishBtn")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Create PV Modal */}
      <Modal
        visible={showCreate}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t("pvNewTitle")}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowCreate(false);
                setNewResolutions([]);
                setNewTitle("");
                setNewSummary("");
              }}
            >
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
          >
            {/* Title */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                {t("pvTitleFieldLabel")}
              </Text>
              <TextInput
                style={[
                  styles.fieldInput,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    color: colors.foreground,
                  },
                ]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder={t("pvTitlePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Type */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                {t("pvMeetingTypeLabel")}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {(
                  Object.entries(TYPE_CONFIG_META) as [
                    PVType,
                    (typeof TYPE_CONFIG_META)[PVType],
                  ][]
                ).map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor:
                          newType === key ? cfg.color : colors.secondary,
                        borderColor:
                          newType === key ? cfg.color : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setNewType(key);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Feather
                      name={cfg.icon}
                      size={12}
                      color={newType === key ? "#fff" : cfg.color}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: newType === key ? "#fff" : colors.foreground },
                      ]}
                    >
                      {t(cfg.key)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Summary */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                {t("pvSummaryFieldLabel")}
              </Text>
              <TextInput
                style={[
                  styles.fieldInput,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    color: colors.foreground,
                    height: 90,
                    textAlignVertical: "top",
                  },
                ]}
                value={newSummary}
                onChangeText={setNewSummary}
                placeholder={t("pvSummaryPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>

            {/* Resolutions */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                {t("pvResolutionsFieldLabel")}
              </Text>
              {newResolutions.map((r, i) => (
                <View
                  key={i}
                  style={[
                    styles.resolutionRow,
                    {
                      backgroundColor: colors.secondary,
                      borderRadius: 10,
                      padding: 8,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.resolutionNum,
                      { backgroundColor: colors.primary + "15" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.resolutionNumText,
                        { color: colors.primary },
                      ]}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.resolutionText,
                      { color: colors.foreground, flex: 1 },
                    ]}
                  >
                    {r}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setNewResolutions((prev) =>
                        prev.filter((_, idx) => idx !== i),
                      )
                    }
                  >
                    <Feather name="x" size={14} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.resolutionAdd}>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      color: colors.foreground,
                      flex: 1,
                    },
                  ]}
                  value={newResolution}
                  onChangeText={setNewResolution}
                  placeholder={t("pvResolutionPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  onSubmitEditing={handleAddResolution}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[
                    styles.addResBtn,
                    {
                      backgroundColor: newResolution.trim()
                        ? colors.primary
                        : colors.muted,
                    },
                  ]}
                  onPress={handleAddResolution}
                  disabled={!newResolution.trim()}
                >
                  <Feather
                    name="plus"
                    size={16}
                    color={
                      newResolution.trim() ? "#fff" : colors.mutedForeground
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                {
                  backgroundColor:
                    newTitle.trim() && newSummary.trim()
                      ? colors.primary
                      : colors.muted,
                },
              ]}
              onPress={handleCreate}
              disabled={!newTitle.trim() || !newSummary.trim()}
            >
              <Feather
                name="file-plus"
                size={16}
                color={
                  newTitle.trim() && newSummary.trim()
                    ? "#fff"
                    : colors.mutedForeground
                }
              />
              <Text
                style={[
                  styles.saveBtnText,
                  {
                    color:
                      newTitle.trim() && newSummary.trim()
                        ? "#fff"
                        : colors.mutedForeground,
                  },
                ]}
              >
                {t("pvCreateBtn")}
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
    paddingBottom: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  filtersRow: { flexShrink: 0, borderBottomWidth: 1, paddingVertical: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  chipDivider: { width: 1, height: 20, marginHorizontal: 2 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 19 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardMetaDot: { fontSize: 11 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", lineHeight: 22 },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginStart: 8,
  },
  pvHero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  pvHeroIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pvHeroRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  pvHeroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  pvHeroMetaText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  section: { padding: 14, borderRadius: 16, borderWidth: 1, gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  sectionBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  resolutionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  resolutionNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  resolutionNumText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  resolutionText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    flex: 1,
  },
  resolutionAdd: { flexDirection: "row", gap: 8, alignItems: "center" },
  addResBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sigRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  sigAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  sigInitials: { fontSize: 12, fontFamily: "Inter_700Bold" },
  sigName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

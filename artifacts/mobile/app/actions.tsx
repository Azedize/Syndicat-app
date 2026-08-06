import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { actions as actionsApi, type ApiUnionAction } from "@/services/api";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";

type ActionType = ApiUnionAction["type"];
type ActionStatus = ApiUnionAction["status"];

const TYPE_CONFIG: Record<ActionType, { labelKey: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  greve:         { labelKey: "actTypeGreve", color: "#ef4444", icon: "zap" },
  manifestation: { labelKey: "actTypeManifestation", color: "#f59e0b", icon: "users" },
  petition:      { labelKey: "actTypePetition", color: "#3b82f6", icon: "file-text" },
  negociation:   { labelKey: "actTypeNegociation", color: "#10b981", icon: "briefcase" },
  communique:    { labelKey: "actTypeCommunique", color: "#8b5cf6", icon: "rss" },
};

const STATUS_CONFIG: Record<ActionStatus, { labelKey: string; color: string }> = {
  planned:   { labelKey: "actStatusPlanned", color: "#3b82f6" },
  active:    { labelKey: "actStatusActive", color: "#10b981" },
  completed: { labelKey: "actStatusCompleted", color: "#6b7280" },
  cancelled: { labelKey: "actStatusCancelled", color: "#ef4444" },
};

export default function ActionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const queryClient = useQueryClient();

  const [selectedAction, setSelectedAction] = useState<ApiUnionAction | null>(null);
  const [filterType, setFilterType] = useState<ActionType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ActionStatus | "all">("all");

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";
  const { showToast } = useToast();
  const { t } = useLanguage();

  // ── Fetch actions ────────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["actions", filterType, filterStatus],
    queryFn: () =>
      actionsApi.list({
        type: filterType !== "all" ? filterType : undefined,
        status: filterStatus !== "all" ? filterStatus : undefined,
      }),
    staleTime: 30_000,
  });

  const actionList: ApiUnionAction[] = data?.data ?? [];

  // ── Support mutation ─────────────────────────────────────────────────────────
  const supportMutation = useMutation({
    mutationFn: (id: string) => actionsApi.toggleSupport(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["actions"] });
      const previous = queryClient.getQueryData<{ data: ApiUnionAction[] }>(["actions", filterType, filterStatus]);
      queryClient.setQueryData(["actions", filterType, filterStatus], (old: any) => ({
        ...old,
        data: old?.data?.map((a: ApiUnionAction) =>
          a.id === id
            ? { ...a, userSupports: !a.userSupports, supportCount: a.userSupports ? a.supportCount - 1 : a.supportCount + 1 }
            : a
        ) ?? [],
      }));
      if (selectedAction?.id === id) {
        setSelectedAction((prev) =>
          prev ? { ...prev, userSupports: !prev.userSupports, supportCount: prev.userSupports ? prev.supportCount - 1 : prev.supportCount + 1 } : null
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["actions", filterType, filterStatus], context.previous);
      showToast({ type: "error", message: t("actSupportError") });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["actions"] }),
  });

  // ── Participate mutation ─────────────────────────────────────────────────────
  const participateMutation = useMutation({
    mutationFn: (id: string) => actionsApi.toggleParticipate(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["actions"] });
      const previous = queryClient.getQueryData<{ data: ApiUnionAction[] }>(["actions", filterType, filterStatus]);
      queryClient.setQueryData(["actions", filterType, filterStatus], (old: any) => ({
        ...old,
        data: old?.data?.map((a: ApiUnionAction) =>
          a.id === id
            ? { ...a, userParticipates: !a.userParticipates, participantsConfirmed: a.userParticipates ? a.participantsConfirmed - 1 : a.participantsConfirmed + 1 }
            : a
        ) ?? [],
      }));
      if (selectedAction?.id === id) {
        setSelectedAction((prev) =>
          prev
            ? { ...prev, userParticipates: !prev.userParticipates, participantsConfirmed: prev.userParticipates ? prev.participantsConfirmed - 1 : prev.participantsConfirmed + 1 }
            : null
        );
      }
      return { previous };
    },
    onSuccess: (result, id) => {
      const action = actionList.find((a) => a.id === id) ?? selectedAction;
      if (result.participating && action) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast({ type: "success", title: t("actParticipateConfirmedToast"), message: t("actParticipateMsg") });
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["actions", filterType, filterStatus], context.previous);
      showToast({ type: "error", message: t("actParticipateError") });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["actions"] }),
  });

  const toggleSupport = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    supportMutation.mutate(id);
  }, [supportMutation]);

  const toggleParticipate = useCallback((id: string) => {
    participateMutation.mutate(id);
  }, [participateMutation]);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const activeCount = actionList.filter((a) => a.status === "active" || a.status === "planned").length;
  const myActions = actionList.filter((a) => a.userParticipates || a.userSupports).length;
  const totalSupports = actionList.reduce((s, a) => s + a.supportCount, 0);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: "#1a1a2e" }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t("actTitle")}</Text>
            <Text style={styles.headerSub}>{t("actSubtitle")}</Text>
          </View>
          <View style={[styles.activeBadge, { backgroundColor: "#ef4444" }]}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>{activeCount} {t("actActiveBadge")}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: t("actStatActive"),   value: activeCount,                             icon: "zap"        as const, color: "#ef4444" },
            { label: t("actStatMyActions"), value: myActions,                             icon: "user-check" as const, color: "#f59e0b" },
            { label: t("actStatSupports"),  value: totalSupports >= 1000 ? `${(totalSupports / 1000).toFixed(1)}k` : totalSupports, icon: "heart" as const, color: "#ec4899" },
          ].map((s) => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
              <Feather name={s.icon} size={14} color={s.color} />
              <Text style={[styles.statValue, { color: "#fff" }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: "rgba(255,255,255,0.65)" }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Type filters */}
      <View style={[styles.filterSection, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, { backgroundColor: filterType === "all" ? "#1a1a2e" : colors.muted }]}
            onPress={() => setFilterType("all")}
          >
            <Text style={[styles.filterText, { color: filterType === "all" ? "#fff" : colors.mutedForeground }]}>{t("actFilterAll")}</Text>
          </TouchableOpacity>
          {(Object.entries(TYPE_CONFIG) as [ActionType, typeof TYPE_CONFIG["greve"]][]).map(([key, cfg]) => (
            <TouchableOpacity
              key={key}
              style={[styles.filterChip, { backgroundColor: filterType === key ? cfg.color : colors.muted }]}
              onPress={() => setFilterType(key)}
            >
              <Feather name={cfg.icon} size={12} color={filterType === key ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.filterText, { color: filterType === key ? "#fff" : colors.mutedForeground }]}>{t(cfg.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Status filters */}
      <View style={[styles.statusFilterBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {([["all", t("actFilterAllStatus"), colors.foreground], ...Object.entries(STATUS_CONFIG).map(([k, v]) => [k, t(v.labelKey), v.color])] as [string, string, string][]).map(([key, label, color]) => (
            <TouchableOpacity
              key={key}
              style={[styles.statusChip, filterStatus === key && { borderColor: color, backgroundColor: color + "15" }]}
              onPress={() => setFilterStatus(key as ActionStatus | "all")}
            >
              {key !== "all" && filterStatus === key && (
                <View style={[styles.statusDot, { backgroundColor: color }]} />
              )}
              <Text style={[styles.filterText, { color: filterStatus === key ? color : colors.mutedForeground }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>{t("actLoading")}</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{t("actLoadError")}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: "#2563EB" }]} onPress={() => refetch()}>
            <Text style={styles.retryText}>{t("actRetry")}</Text>
          </TouchableOpacity>
        </View>
      ) : actionList.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={40} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{t("actEmpty")}</Text>
          {isAdmin && (
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>{t("actEmptyAdmin")}</Text>
          )}
        </View>
      ) : (
        <FlatList
          data={actionList}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2563EB" />}
          renderItem={({ item: a }) => {
            const type = TYPE_CONFIG[a.type];
            const status = STATUS_CONFIG[a.status];
            const participationPct = a.participantsTarget > 0 ? (a.participantsConfirmed / a.participantsTarget) * 100 : 100;

            return (
              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: type.color }]}
                onPress={() => { setSelectedAction(a); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.8}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.typeIcon, { backgroundColor: type.color + "18" }]}>
                    <Feather name={type.icon} size={20} color={type.color} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.badgeRow}>
                      <View style={[styles.typeBadge, { backgroundColor: type.color + "15" }]}>
                        <Text style={[styles.typeBadgeText, { color: type.color }]}>{t(type.labelKey)}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: status.color + "15" }]}>
                        {a.status === "active" && <View style={[styles.statusDot, { backgroundColor: status.color }]} />}
                        <Text style={[styles.statusText, { color: status.color }]}>{t(status.labelKey)}</Text>
                      </View>
                    </View>
                    <Text style={[styles.actionTitle, { color: colors.foreground }]}>{a.title}</Text>
                  </View>
                </View>

                <Text style={[styles.actionDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {a.description}
                </Text>

                <View style={styles.cardMeta}>
                  <View style={styles.metaItem}>
                    <Feather name="calendar" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{a.date}</Text>
                  </View>
                  {a.location && (
                    <View style={styles.metaItem}>
                      <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{a.location}</Text>
                    </View>
                  )}
                </View>

                {/* Participation bar */}
                {a.participantsTarget > 0 && (
                  <View style={{ gap: 4 }}>
                    <View style={styles.partRow}>
                      <Text style={[styles.partLabel, { color: colors.mutedForeground }]}>
                        {a.participantsConfirmed.toLocaleString()} / {a.participantsTarget.toLocaleString()} {t("actParticipants")}
                      </Text>
                      <Text style={[styles.partPct, { color: type.color }]}>{Math.min(participationPct, 100).toFixed(0)}%</Text>
                    </View>
                    <View style={[styles.partBar, { backgroundColor: colors.muted }]}>
                      <View style={[styles.partBarFill, { width: `${Math.min(participationPct, 100)}%` as any, backgroundColor: type.color }]} />
                    </View>
                  </View>
                )}

                {/* Action buttons */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.supportBtn, { backgroundColor: a.userSupports ? "#ec4899" : colors.muted }]}
                    onPress={() => toggleSupport(a.id)}
                    disabled={supportMutation.isPending}
                  >
                    <Feather name="heart" size={13} color={a.userSupports ? "#fff" : colors.mutedForeground} />
                    <Text style={[styles.supportBtnText, { color: a.userSupports ? "#fff" : colors.mutedForeground }]}>
                      {a.supportCount.toLocaleString()}
                    </Text>
                  </TouchableOpacity>

                  {(a.status === "planned" || a.status === "active") && a.type !== "negociation" && (
                    <TouchableOpacity
                      style={[styles.participateBtn, { backgroundColor: a.userParticipates ? type.color + "20" : type.color, borderColor: type.color }]}
                      onPress={() => toggleParticipate(a.id)}
                      disabled={participateMutation.isPending}
                    >
                      <Feather name={a.userParticipates ? "check-circle" : "plus-circle"} size={13} color={a.userParticipates ? type.color : "#fff"} />
                      <Text style={[styles.participateBtnText, { color: a.userParticipates ? type.color : "#fff" }]}>
                        {a.userParticipates ? t("actConfirmedBtn") : t("actParticipateBtn")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Detail modal */}
      <Modal visible={!!selectedAction} animationType="slide" presentationStyle="pageSheet">
        {selectedAction && (() => {
          const a = selectedAction;
          const type = TYPE_CONFIG[a.type];
          const status = STATUS_CONFIG[a.status];
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: type.color }]}>
                <TouchableOpacity onPress={() => setSelectedAction(null)}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <View style={styles.modalBadgeRow}>
                    <View style={[styles.modalBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                      <Feather name={type.icon} size={11} color="#fff" />
                      <Text style={styles.modalBadgeText}>{t(type.labelKey)}</Text>
                    </View>
                    <View style={[styles.modalBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                      <Text style={styles.modalBadgeText}>{t(status.labelKey)}</Text>
                    </View>
                  </View>
                  <Text style={styles.modalTitle} numberOfLines={3}>{a.title}</Text>
                </View>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
                {/* Support & participate */}
                <View style={styles.actionBtnsRow}>
                  <TouchableOpacity
                    style={[styles.bigSupportBtn, { backgroundColor: a.userSupports ? "#ec4899" : colors.card, borderColor: "#ec4899" }]}
                    onPress={() => toggleSupport(a.id)}
                    disabled={supportMutation.isPending}
                  >
                    <Feather name="heart" size={18} color={a.userSupports ? "#fff" : "#ec4899"} />
                    <Text style={[styles.bigSupportText, { color: a.userSupports ? "#fff" : "#ec4899" }]}>
                      {a.userSupports ? t("actSupportedBtn") : t("actSupportBtn")} ({a.supportCount.toLocaleString()})
                    </Text>
                  </TouchableOpacity>
                  {(a.status === "planned" || a.status === "active") && a.type !== "negociation" && (
                    <TouchableOpacity
                      style={[styles.bigParticipateBtn, { backgroundColor: a.userParticipates ? type.color : colors.card, borderColor: type.color }]}
                      onPress={() => toggleParticipate(a.id)}
                      disabled={participateMutation.isPending}
                    >
                      <Feather name={a.userParticipates ? "check-circle" : "plus-circle"} size={18} color={a.userParticipates ? "#fff" : type.color} />
                      <Text style={[styles.bigParticipateText, { color: a.userParticipates ? "#fff" : type.color }]}>
                        {a.userParticipates ? t("actConfirmedBtn") : t("actParticipateBtn")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Description */}
                <Text style={[styles.detailDesc, { color: colors.foreground }]}>{a.description}</Text>

                {/* Info card */}
                <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {([
                    { icon: "calendar" as const,  label: t("actModalDate"), value: a.date },
                    ...(a.location ? [{ icon: "map-pin" as const, label: t("actModalLocation"), value: a.location }] : []),
                    { icon: "user" as const, label: t("actModalOrganizer"), value: a.organizer },
                    ...(a.participantsTarget > 0 ? [{ icon: "users" as const, label: t("actModalParticipants"), value: `${a.participantsConfirmed.toLocaleString()} ${t("actConfirmed")} / ${a.participantsTarget.toLocaleString()} ${t("actTarget")}` }] : []),
                  ] as { icon: keyof typeof Feather.glyphMap; label: string; value: string }[]).map(({ icon, label, value }, i) => (
                    <View key={label}>
                      {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                      <View style={styles.infoRow}>
                        <Feather name={icon} size={14} color={type.color} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
                          <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Demands */}
                {a.demands.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("actSectionDemands")}</Text>
                    {a.demands.map((d, i) => (
                      <View key={i} style={styles.demandRow}>
                        <View style={[styles.demandBullet, { backgroundColor: type.color }]}>
                          <Text style={styles.demandBulletText}>{i + 1}</Text>
                        </View>
                        <Text style={[styles.demandText, { color: colors.foreground }]}>{d}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Updates */}
                {a.updates.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("actSectionUpdates")}</Text>
                    {a.updates.map((u, i) => (
                      <View key={i} style={[styles.updateCard, { backgroundColor: colors.card, borderLeftColor: type.color, borderColor: colors.border }]}>
                        <Text style={[styles.updateDate, { color: type.color }]}>{u.date}</Text>
                        <Text style={[styles.updateText, { color: colors.foreground }]}>{u.text}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Tags */}
                {a.tags.length > 0 && (
                  <View style={styles.tagsRow}>
                    {a.tags.map((tag) => (
                      <View key={tag} style={[styles.tag, { backgroundColor: type.color + "15" }]}>
                        <Text style={[styles.tagText, { color: type.color }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          );
        })()}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  errorText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  hintText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  header: { paddingHorizontal: 20, paddingBottom: 20, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  activeBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  activeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  statsRow: { flexDirection: "row", gap: 10 },
  statBox: { flex: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center", gap: 4 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },

  filterSection: { borderBottomWidth: 1, paddingVertical: 10 },
  statusFilterBar: { borderBottomWidth: 1, paddingVertical: 8 },
  filterScroll: { paddingHorizontal: 14, gap: 8 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: "transparent" },
  filterText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },

  actionCard: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, padding: 16, gap: 12 },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  typeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  actionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  actionDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  partRow: { flexDirection: "row", justifyContent: "space-between" },
  partLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  partPct: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  partBar: { height: 4, borderRadius: 2 },
  partBarFill: { height: 4, borderRadius: 2 },
  cardActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  supportBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  supportBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  participateBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  participateBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  modal: { flex: 1 },
  modalHeader: { padding: 20, paddingTop: 48, gap: 14, flexDirection: "row", alignItems: "flex-start" },
  modalBadgeRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  modalBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  modalBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 26 },
  actionBtnsRow: { flexDirection: "row", gap: 10 },
  bigSupportBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  bigSupportText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  bigParticipateBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  bigParticipateText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  detailDesc: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  infoCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sep: { height: 1 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  demandRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  demandBullet: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  demandBulletText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  demandText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  updateCard: { borderRadius: 10, borderWidth: 1, borderLeftWidth: 3, padding: 12, gap: 4 },
  updateDate: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  updateText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  tagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
});

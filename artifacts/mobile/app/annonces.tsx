import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { announcements, type ApiAnnouncement } from "@/services/api";
import { useToast } from "@/context/ToastContext";
import EmptyState from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { Button, Card, Chip, ListItem, SheetHeader, Skeleton, StatusBadge, TextField, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";

type Priority = ApiAnnouncement["priority"];
type FeatherName = keyof typeof Feather.glyphMap;

const PRIORITY_META: Record<string, { tone: StatusTone; icon: FeatherName; key: string }> = {
  urgent: { tone: "danger", icon: "alert-circle", key: "priorityUrgent" },
  important: { tone: "warning", icon: "alert-triangle", key: "priorityImportant" },
  info: { tone: "info", icon: "info", key: "priorityInfo" },
  normal: { tone: "info", icon: "info", key: "priorityInfo" },
};
const priorityMeta = (p: string) => PRIORITY_META[p] ?? PRIORITY_META.info;

export default function AnnoncesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { date } = useFormat();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // Same roles as the API (POST/DELETE /announcements): other roles read only.
  const canManage = user?.role === "super_admin" || user?.role === "syndicate_admin";

  const [selected, setSelected] = useState<ApiAnnouncement | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all");

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("info");
  const [newAudience, setNewAudience] = useState("");
  const [newPinned, setNewPinned] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => announcements.list(),
    staleTime: 30_000,
  });

  const resetForm = () => {
    setNewTitle("");
    setNewBody("");
    setNewPriority("info");
    setNewAudience("");
    setNewPinned(false);
  };

  const createMutation = useMutation({
    mutationFn: (d: Parameters<typeof announcements.create>[0]) => announcements.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setShowCreate(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("publishAnnouncement"), message: t("annPublishedMessage") });
    },
    onError: () => showToast({ type: "error", title: t("annActionErrorTitle"), message: t("annPublishError") }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcements.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setSelected(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => showToast({ type: "error", title: t("annActionErrorTitle"), message: t("annDeleteError") }),
  });

  const all = data?.data ?? [];
  const filtered = filterPriority === "all" ? all : all.filter((a) => a.priority === filterPriority || (filterPriority === "info" && a.priority === ("normal" as Priority)));
  const sortedList = [...filtered.filter((a) => a.pinned), ...filtered.filter((a) => !a.pinned)];
  const countOf = (p: string) => all.filter((a) => a.priority === p || (p === "info" && a.priority === ("normal" as Priority))).length;
  const isExpired = (a: ApiAnnouncement) => !!a.expiresAt && new Date(a.expiresAt).getTime() < Date.now();

  const ago = (iso: string) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${t("annTimeAgoPrefix")} ${mins}${t("annMinutesShort")}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${t("annTimeAgoPrefix")} ${hrs}${t("annHoursShort")}`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${t("annTimeAgoPrefix")} ${days}${t("annDaysShort")}`;
    return date(iso);
  };

  const handleCreate = () => {
    if (!newTitle.trim() || !newBody.trim()) {
      showToast({ type: "warning", title: t("requiredFields"), message: t("annRequiredMessage") });
      return;
    }
    createMutation.mutate({
      title: newTitle.trim(),
      body: newBody.trim(),
      priority: newPriority,
      audience: newAudience.trim() || t("uiAnnAudienceAll"),
      pinned: newPinned,
    });
  };

  const handleDelete = (a: ApiAnnouncement) => {
    Alert.alert(t("confirmDeleteTitle"), `${t("deleteAnnouncement")} « ${a.title} » ?`, [
      { text: t("annCancel"), style: "cancel" },
      { text: t("deleteAnnouncement"), style: "destructive", onPress: () => deleteMutation.mutate(a.id) },
    ]);
  };

  const openCreate = () => {
    setShowCreate(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const header = (
    <ScreenHeader
      title={t("announcesTitle")}
      subtitle={!isLoading && !isError ? `${data?.total ?? all.length} ${t("annCount")}` : undefined}
      action={canManage ? { icon: "plus", label: t("createAnnouncement"), onPress: openCreate } : undefined}
    />
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {header}
        <View style={{ padding: 16, gap: 12 }} accessibilityLabel={t("annLoading")}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={112} radius={RADIUS.LG} />
          ))}
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {header}
        <ErrorState title={t("annLoadError")} description={t("uiLoadErrorHint")} retryLabel={t("annRetry")} onRetry={() => refetch()} accentColor={colors.primary} />
      </View>
    );
  }

  const FILTERS: { key: Priority | "all"; label: string; icon?: FeatherName }[] = [
    { key: "all", label: `${t("filterToutes")} · ${all.length}` },
    { key: "urgent", label: `${t("priorityUrgent")} · ${countOf("urgent")}`, icon: "alert-circle" },
    { key: "important", label: `${t("priorityImportant")} · ${countOf("important")}`, icon: "alert-triangle" },
    { key: "info", label: `${t("priorityInfo")} · ${countOf("info")}`, icon: "info" },
  ];

  const sel = selected ? priorityMeta(selected.priority) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      {header}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ flexGrow: 0 }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} icon={f.icon} selected={filterPriority === f.key} onPress={() => setFilterPriority(f.key)} />
        ))}
      </ScrollView>

      <FlatList
        data={sortedList}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="bell-off"
            title={t("noAnnouncementsYet")}
            description={t("annEmptyDescription")}
            actionLabel={canManage ? t("createAnnouncement") : undefined}
            onAction={canManage ? openCreate : undefined}
          />
        }
        renderItem={({ item: a }) => {
          const pm = priorityMeta(a.priority);
          const tc = toneColors(colors, pm.tone);
          const expired = isExpired(a);
          return (
            <Card
              onPress={() => {
                setSelected(a);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              accessibilityLabel={`${t(pm.key)} — ${a.title}`}
              padding="none"
              style={expired ? { opacity: 0.7 } : undefined}
            >
              <View style={[styles.accent, { backgroundColor: tc.fg }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <View style={[styles.iconBox, { backgroundColor: tc.bg }]}>
                    <Feather name={pm.icon} size={18} color={tc.fg} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={[TYPE.bodyStrong, { color: colors.foreground, textAlign: "auto" }]} numberOfLines={2}>
                      {a.title}
                    </Text>
                    <Text style={[TYPE.secondary, { color: colors.textSecondary, textAlign: "auto" }]} numberOfLines={2}>
                      {a.body}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <View style={styles.badges}>
                    {a.pinned ? <StatusBadge label={t("announcePinned")} tone="primary" icon="bookmark" /> : null}
                    <StatusBadge label={t(pm.key)} tone={pm.tone} icon={null} />
                    {expired ? <StatusBadge label={t("uiExpired")} tone="neutral" icon="clock" /> : null}
                  </View>
                  <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    {a.author} · {ago(a.createdAt)}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }}
      />

      {/* Detail */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && sel ? (
          <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
            <SheetHeader title={selected.title} subtitle={selected.audience} onClose={() => setSelected(null)} />
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }}>
              <View style={styles.badges}>
                <StatusBadge label={t(sel.key)} tone={sel.tone} icon={sel.icon} size="md" />
                {selected.pinned ? <StatusBadge label={t("announcePinned")} tone="primary" icon="bookmark" size="md" /> : null}
                {isExpired(selected) ? <StatusBadge label={t("uiExpired")} tone="neutral" icon="clock" size="md" /> : null}
              </View>
              <Card padding="lg">
                <Text style={[TYPE.body, { color: colors.foreground, lineHeight: 23, textAlign: "auto" }]} selectable>
                  {selected.body}
                </Text>
              </Card>
              <Card padding="none">
                <ListItem icon="user" title={selected.author} subtitle={t("authorLabel")} divider />
                <ListItem icon="users" title={selected.audience} subtitle={t("audienceLabel")} divider />
                <ListItem icon="clock" title={date(selected.createdAt, { day: "numeric", month: "long", year: "numeric" })} subtitle={t("publishedOn")} divider={!!selected.expiresAt} />
                {selected.expiresAt ? <ListItem icon="calendar" title={date(selected.expiresAt)} subtitle={t("expiresOn")} /> : null}
              </Card>
              {canManage ? (
                <Button
                  label={t("deleteAnnouncement")}
                  icon="trash-2"
                  variant="destructive"
                  fullWidth
                  loading={deleteMutation.isPending}
                  onPress={() => handleDelete(selected)}
                />
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Create */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={t("createAnnouncement")} subtitle={t("annCreateSubtitle")} onClose={() => setShowCreate(false)} />
          <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 60 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{t("annPriorityLabel")}</Text>
              <View style={styles.badges} accessibilityRole="radiogroup">
                {(["info", "important", "urgent"] as Priority[]).map((p) => (
                  <Chip
                    key={p}
                    label={t(priorityMeta(p).key)}
                    icon={priorityMeta(p).icon}
                    selected={newPriority === p}
                    onPress={() => {
                      setNewPriority(p);
                      Haptics.selectionAsync();
                    }}
                  />
                ))}
              </View>
            </View>

            <TextField label={t("annFormTitle")} required placeholder={t("annTitlePlaceholder")} value={newTitle} onChangeText={setNewTitle} maxLength={200} />
            <TextField label={t("annFormContent")} required placeholder={t("annContentPlaceholder")} value={newBody} onChangeText={setNewBody} multiline />
            <TextField
              label={t("audienceLabel")}
              placeholder={t("uiAnnAudienceAll")}
              helper={t("uiAnnAudienceHelper")}
              value={newAudience}
              onChangeText={setNewAudience}
            />

            <Card padding="none">
              <ListItem
                icon="bookmark"
                iconTone="primary"
                title={t("announcePinned")}
                subtitle={t("uiAnnPinHelper")}
                trailing={
                  <Switch
                    value={newPinned}
                    onValueChange={setNewPinned}
                    accessibilityLabel={t("announcePinned")}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={Platform.OS === "android" ? (newPinned ? colors.primaryForeground : colors.surface) : undefined}
                  />
                }
              />
            </Card>

            <Button
              label={createMutation.isPending ? t("annPublishing") : t("publishAnnouncement")}
              icon="send"
              size="lg"
              fullWidth
              loading={createMutation.isPending}
              disabled={!newTitle.trim() || !newBody.trim()}
              onPress={handleCreate}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  accent: { position: "absolute", top: 0, bottom: 0, start: 0, width: 4 },
  cardBody: { padding: 14, paddingStart: 18, gap: 12 },
  cardTop: { flexDirection: "row", gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { shareContent } from "@/hooks/useShare";
import { FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { apiRequest } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { Avatar, Button, Card, Chip, SheetHeader, Skeleton, StatusBadge, TextField, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";

type ApiComment = { id: string; text: string; userName?: string | null; authorName?: string | null; userId?: string | null; createdAt: string };
type ApiPublication = {
  id: string;
  title: string;
  content: string;
  category: string;
  pinned?: boolean;
  authorName?: string | null;
  author?: string | null;
  createdAt: string;
  likes?: number;
  userLiked?: boolean;
  comments?: ApiComment[];
};

// Categories offered when publishing (stored as typed by the API).
const CATEGORIES: { key: string; tone: StatusTone; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "communiqué", tone: "danger", icon: "volume-2" },
  { key: "actualité", tone: "info", icon: "rss" },
  { key: "rapport", tone: "warning", icon: "file-text" },
  { key: "résultats", tone: "success", icon: "bar-chart-2" },
  { key: "formation", tone: "primary", icon: "book-open" },
  { key: "partenariat", tone: "primary", icon: "briefcase" },
];
const catMeta = (c: string) => CATEGORIES.find((x) => x.key === c);
const catLabel = (c: string) => (c ? c.charAt(0).toUpperCase() + c.slice(1) : "");

export default function PublicationsScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const { t, isRTL } = useLanguage();
  const { date } = useFormat();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toggleFavorite, isFavorite } = useFavorites();
  const FAV_ID = "screen-publications";
  // Same roles as POST /publications.
  const canPublish = user?.role === "syndicate_admin" || user?.role === "secretary" || user?.role === "president";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("actualité");
  const [commentText, setCommentText] = useState("");

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["publications"],
    queryFn: () => apiRequest<{ data: ApiPublication[] }>("/publications?limit=100"),
    staleTime: 30_000,
  });
  const publications = data?.data ?? [];
  const selected = publications.find((p) => p.id === selectedId) ?? null;
  const usedCats = [...new Set(publications.map((p) => p.category).filter(Boolean))];
  const filtered = publications.filter((p) => filterCat === "all" || p.category === filterCat);
  const sorted = [...filtered.filter((p) => p.pinned), ...filtered.filter((p) => !p.pinned)];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["publications"] });

  const likeMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/publications/${id}/like`, "POST"),
    onSuccess: refresh,
    onError: () => showToast({ type: "error", title: t("error"), message: t("uiActionFailed") }),
  });
  const commentMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => apiRequest(`/publications/${id}/comments`, "POST", { text }),
    onSuccess: () => {
      setCommentText("");
      refresh();
    },
    onError: () => showToast({ type: "error", title: t("error"), message: t("uiActionFailed") }),
  });
  const createMutation = useMutation({
    mutationFn: (body: { title: string; content: string; category: string }) => apiRequest("/publications", "POST", body),
    onSuccess: () => {
      setShowCreate(false);
      setNewTitle("");
      setNewContent("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("pubCreatedToast"), message: t("pubCreatedMsg") });
      refresh();
    },
    onError: () => showToast({ type: "error", title: t("error"), message: t("uiActionFailed") }),
  });

  const like = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    likeMutation.mutate(id);
  };
  const likesOf = (p: ApiPublication) => p.likes ?? 0;
  const authorOf = (p: ApiPublication) => p.authorName ?? p.author ?? "";
  const openCreate = () => {
    setShowCreate(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const header = (
    <ScreenHeader
      title={t("pubTitle")}
      subtitle={!isLoading && !isError ? `${filtered.length} ${t("pubSubtitle")}` : undefined}
      action={canPublish ? { icon: "plus", label: t("pubCreateAction"), onPress: openCreate } : undefined}
      action2={{
        icon: "star",
        label: isFavorite(FAV_ID) ? t("uiFavoriteRemove") : t("uiFavoriteAdd"),
        onPress: () => toggleFavorite({ id: FAV_ID, title: t("pubTitle"), icon: "rss", color: colors.danger, route: "/publications" }),
      }}
    />
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {header}
        <View style={{ padding: 16, gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={160} radius={RADIUS.LG} />
          ))}
        </View>
      </View>
    );
  }
  if (isError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {header}
        <ErrorState title={t("uiLoadErrorTitle")} description={t("uiLoadErrorHint")} retryLabel={t("retry")} onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      {header}

      {usedCats.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ flexGrow: 0 }}>
          <Chip label={t("pubFilterAll")} selected={filterCat === "all"} onPress={() => setFilterCat("all")} />
          {usedCats.map((c) => (
            <Chip key={c} label={catLabel(c)} icon={catMeta(c)?.icon} selected={filterCat === c} onPress={() => setFilterCat(c)} />
          ))}
        </ScrollView>
      ) : null}

      <FlatList
        data={sorted}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} />}
        ListEmptyComponent={
          <EmptyState icon="rss" title={t("pubEmptyTitle")} description={t("pubEmptyDesc")} actionLabel={canPublish ? t("pubCreateAction") : undefined} onAction={canPublish ? openCreate : undefined} />
        }
        renderItem={({ item: pub }) => {
          const meta = catMeta(pub.category);
          return (
            <Card padding="md" onPress={() => setSelectedId(pub.id)} accessibilityLabel={pub.title} style={{ gap: 10 }}>
              <View style={styles.row}>
                {pub.pinned ? <StatusBadge label={t("pubPinned")} tone="primary" icon="bookmark" /> : null}
                {pub.category ? <StatusBadge label={catLabel(pub.category)} tone={meta?.tone ?? "neutral"} icon={null} /> : null}
                <View style={{ flex: 1 }} />
                <Text style={[TYPE.caption, { color: colors.textMuted }]}>{date(pub.createdAt)}</Text>
              </View>
              <Text style={[TYPE.subtitle, { color: colors.foreground, textAlign: "auto" }]}>{pub.title}</Text>
              <Text style={[TYPE.secondary, { color: colors.textSecondary, textAlign: "auto" }]} numberOfLines={3}>
                {pub.content}
              </Text>
              <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <Avatar name={authorOf(pub) || "?"} size={26} />
                <Text style={[TYPE.caption, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                  {authorOf(pub)}
                </Text>
                <Pressable onPress={() => like(pub.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${t("pubLike")} (${likesOf(pub)})`} style={styles.pill}>
                  <Feather name="heart" size={14} color={pub.userLiked ? colors.danger : colors.textMuted} />
                  <Text style={[TYPE.caption, { color: pub.userLiked ? colors.dangerText : colors.textMuted }]}>{likesOf(pub)}</Text>
                </Pressable>
                <View style={styles.pill}>
                  <Feather name="message-circle" size={14} color={colors.textMuted} />
                  <Text style={[TYPE.caption, { color: colors.textMuted }]}>{pub.comments?.length ?? 0}</Text>
                </View>
              </View>
            </Card>
          );
        }}
      />

      {/* Reader + comments */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedId(null)}>
        {selected ? (
          <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]} behavior="padding">
            <SheetHeader title={catLabel(selected.category) || t("pubTitle")} subtitle={date(selected.createdAt)} onClose={() => setSelectedId(null)} />
            <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
              <Text style={[TYPE.title, { color: colors.foreground, textAlign: "auto" }]}>{selected.title}</Text>
              <View style={styles.row}>
                <Avatar name={authorOf(selected) || "?"} size={36} />
                <Text style={[TYPE.bodyStrong, { color: colors.foreground, flex: 1 }]}>{authorOf(selected)}</Text>
              </View>
              <Text style={[TYPE.body, { color: colors.foreground, lineHeight: 24, textAlign: "auto" }]} selectable>
                {selected.content}
              </Text>

              <View style={styles.row}>
                <Button
                  label={`${likesOf(selected)} ${t("pubLike")}`}
                  icon="heart"
                  variant={selected.userLiked ? "primary" : "secondary"}
                  size="sm"
                  loading={likeMutation.isPending}
                  onPress={() => like(selected.id)}
                />
                <Button
                  label={t("uiShare")}
                  icon="share-2"
                  variant="ghost"
                  size="sm"
                  onPress={() => shareContent(`${selected.title}\n\n${selected.content.slice(0, 160)}${selected.content.length > 160 ? "…" : ""}`, selected.title)}
                />
              </View>

              <View style={{ gap: 10 }}>
                <Text style={[TYPE.subtitle, { color: colors.foreground }]}>
                  {t("pubCommentsTitle")} ({selected.comments?.length ?? 0})
                </Text>
                {(selected.comments ?? []).length === 0 ? (
                  <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("pubCommentsEmpty")}</Text>
                ) : (
                  (selected.comments ?? []).map((c) => {
                    const who = c.userName ?? c.authorName ?? "?";
                    return (
                      <View key={c.id} style={styles.comment}>
                        <Avatar name={who} size={30} />
                        <View style={[styles.bubble, { backgroundColor: c.userId === user?.id ? colors.primarySoft : colors.surfaceMuted }]}>
                          <View style={styles.row}>
                            <Text style={[TYPE.label, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                              {who}
                            </Text>
                            <Text style={[TYPE.caption, { color: colors.textMuted }]}>{date(c.createdAt)}</Text>
                          </View>
                          <Text style={[TYPE.body, { color: colors.foreground, textAlign: "auto" }]}>{c.text}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
                <TextField label={t("pubCommentPlaceholder")} value={commentText} onChangeText={setCommentText} multiline maxLength={2000} />
                <Button
                  label={t("supportSend")}
                  icon="send"
                  fullWidth
                  loading={commentMutation.isPending}
                  disabled={!commentText.trim()}
                  onPress={() => commentMutation.mutate({ id: selected.id, text: commentText.trim() })}
                />
              </View>
            </KeyboardAwareScrollViewCompat>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>

      {/* Publish */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={t("pubCreateTitle")} onClose={() => setShowCreate(false)} />
          <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{t("pubFieldCategory")}</Text>
              <View style={styles.chips}>
                {CATEGORIES.map((c) => (
                  <Chip key={c.key} label={catLabel(c.key)} icon={c.icon} selected={newCategory === c.key} onPress={() => setNewCategory(c.key)} />
                ))}
              </View>
            </View>
            <TextField label={t("pubFieldTitle")} required value={newTitle} onChangeText={setNewTitle} placeholder={t("pubTitlePlaceholder")} />
            <TextField label={t("pubFieldContent")} required value={newContent} onChangeText={setNewContent} placeholder={t("pubContentPlaceholder")} multiline />
            <Button
              label={t("pubPublishBtn")}
              icon="send"
              size="lg"
              fullWidth
              loading={createMutation.isPending}
              disabled={!newTitle.trim() || !newContent.trim()}
              onPress={() => createMutation.mutate({ title: newTitle.trim(), content: newContent.trim(), category: newCategory })}
            />
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingHorizontal: 4 },
  comment: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bubble: { flex: 1, borderRadius: RADIUS.MD, padding: 10, gap: 4 },
});

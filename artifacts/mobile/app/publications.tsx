import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import { shareContent } from "@/hooks/useShare";
import {
  Alert,
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
import { useData, type Publication } from "@/context/DataContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import EmptyState from "@/components/EmptyState";
import FilterChips from "@/components/FilterChips";

const CAT_COLORS: Record<string, string> = {
  communiqué: "#ef4444",
  résultats: "#10b981",
  formation: "#3b82f6",
  rapport: "#f59e0b",
  partenariat: "#8b5cf6",
  actualité: "#06b6d4",
};

export default function PublicationsScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { publications, likePublication, addPublication } = useData();
  const { toggleFavorite, isFavorite } = useFavorites();
  const FAV_ID = "screen-publications";
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  const [selected, setSelected] = useState<Publication | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [filterCat, setFilterCat] = useState("all");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("actualité");
  const isAdmin = user?.role !== "member";

  const [showEditPub, setShowEditPub] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentsByPub, setCommentsByPub] = useState<Record<string, string[]>>({});

  const categories = ["all", ...Object.keys(CAT_COLORS)];
  const filtered = publications.filter((p) => filterCat === "all" || p.category === filterCat);

  const handleLike = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!liked.has(id)) {
      likePublication(id);
      setLiked((prev) => { const next = new Set(prev); next.add(id); return next; });
    } else {
      setLiked((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleCreate = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    const pub: Publication = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      content: newContent.trim(),
      date: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
      author: user?.name ?? "Admin",
      category: newCategory,
      pinned: false,
      likes: 0,
      comments: 0,
    };
    addPublication(pub);
    setShowCreate(false);
    setNewTitle(""); setNewContent("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast({ type: "success", title: t("pubCreatedToast"), message: t("pubCreatedMsg") });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("pubTitle")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {filtered.length} {t("pubSubtitle")}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => toggleFavorite({ id: FAV_ID, title: t("pubTitle"), icon: "rss", color: "#ef4444", route: "/publications" })}
          style={{ padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="star" size={20} color={isFavorite(FAV_ID) ? "#f59e0b" : colors.mutedForeground} />
        </TouchableOpacity>
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      <FilterChips
        options={[
          { key: "all", label: t("pubFilterAll") },
          ...Object.entries(CAT_COLORS).map(([cat, color]) => ({ key: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1), color })),
        ]}
        value={filterCat}
        onChange={setFilterCat}
        mode="scroll"
      />

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : { padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="rss"
            title={t("pubEmptyTitle")}
            description={t("pubEmptyDesc")}
            actionLabel={isAdmin ? t("pubCreateAction") : undefined}
            onAction={isAdmin ? () => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } : undefined}
          />
        }
        renderItem={({ item: pub }) => {
          const catColor = CAT_COLORS[pub.category] ?? colors.primary;
          const isLiked = liked.has(pub.id);
          return (
            <TouchableOpacity
              style={[styles.pubCard, { backgroundColor: colors.card, borderColor: pub.pinned ? colors.primary + "50" : colors.border, borderLeftColor: catColor }]}
              onPress={() => setSelected(pub)}
              activeOpacity={0.8}
            >
              {pub.pinned ? (
                <View style={[styles.pinnedBadge, { backgroundColor: colors.primary }]}>
                  <Feather name="bookmark" size={10} color="#fff" />
                  <Text style={styles.pinnedText}>{t("pubPinned")}</Text>
                </View>
              ) : null}

              <View style={styles.pubMeta}>
                <View style={[styles.catBadge, { backgroundColor: catColor + "18" }]}>
                  <Text style={[styles.catLabel2, { color: catColor }]}>{pub.category.toUpperCase()}</Text>
                </View>
                <Text style={[styles.pubDate, { color: colors.mutedForeground }]}>{pub.date}</Text>
              </View>

              <Text style={[styles.pubTitle, { color: colors.foreground }]}>{pub.title}</Text>
              <Text style={[styles.pubContent, { color: colors.mutedForeground }]} numberOfLines={3}>
                {pub.content}
              </Text>

              <View style={styles.pubFooter}>
                <View style={styles.pubAuthorRow}>
                  <View style={[styles.authorAvatar, { backgroundColor: catColor + "20" }]}>
                    <Text style={[styles.authorInitials, { color: catColor }]}>
                      {pub.author.split(" ")[0]?.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.pubAuthor, { color: colors.mutedForeground }]}>{pub.author}</Text>
                </View>
                <View style={styles.pubActions}>
                  <TouchableOpacity style={styles.actionPill} onPress={() => handleLike(pub.id)}>
                    <Feather name="heart" size={13} color={isLiked ? "#ef4444" : colors.mutedForeground} />
                    <Text style={[styles.actionCount, { color: isLiked ? "#ef4444" : colors.mutedForeground }]}>
                      {pub.likes + (isLiked ? 1 : 0)}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.actionPill}>
                    <Feather name="message-circle" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{pub.comments}</Text>
                  </View>
                  <Text style={[styles.readMore, { color: colors.primary }]}>{t("pubReadMore")}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Article reader modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={[styles.shareBtn, { backgroundColor: colors.secondary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  shareContent(`${selected.title}\n\n${selected.content.slice(0, 120)}...\n\nLire sur MIZAN`, selected.title);
                }}
              >
                <Feather name="share-2" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              <View style={styles.articleMeta}>
                <View style={[styles.catBadge, { backgroundColor: (CAT_COLORS[selected.category] ?? colors.primary) + "18" }]}>
                  <Text style={[styles.catLabel2, { color: CAT_COLORS[selected.category] ?? colors.primary }]}>
                    {selected.category.toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.pubDate, { color: colors.mutedForeground }]}>{selected.date}</Text>
              </View>

              <Text style={[styles.articleTitle, { color: colors.foreground }]}>{selected.title}</Text>

              <View style={[styles.articleAuthor, { borderColor: colors.border }]}>
                <View style={[styles.authorAvatarLg, { backgroundColor: (CAT_COLORS[selected.category] ?? colors.primary) + "20" }]}>
                  <Text style={[styles.authorInitialsLg, { color: CAT_COLORS[selected.category] ?? colors.primary }]}>
                    {selected.author.split(" ")[0]?.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.articleAuthorName, { color: colors.foreground }]}>{selected.author}</Text>
                </View>
              </View>

              <Text style={[styles.articleContent, { color: colors.foreground }]}>{selected.content}</Text>

              <View style={[styles.engagementRow, { borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.engBtn, {
                    backgroundColor: liked.has(selected.id) ? "#ef444415" : colors.secondary,
                    borderColor: liked.has(selected.id) ? "#ef4444" : "transparent",
                    borderWidth: 1,
                  }]}
                  onPress={() => handleLike(selected.id)}
                >
                  <Feather name="heart" size={16} color={liked.has(selected.id) ? "#ef4444" : colors.mutedForeground} />
                  <Text style={[styles.engBtnText, { color: liked.has(selected.id) ? "#ef4444" : colors.mutedForeground }]}>
                    {selected.likes + (liked.has(selected.id) ? 1 : 0)} {t("pubLike")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.engBtn, { backgroundColor: colors.secondary }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowComments(true); }}
                >
                  <Feather name="message-circle" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.engBtnText, { color: colors.mutedForeground }]}>{selected.comments} {t("pubComments")}</Text>
                </TouchableOpacity>
              </View>

              {isAdmin ? (
                <View style={styles.adminActions}>
                  <TouchableOpacity
                    style={[styles.adminBtn, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "08" }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setEditTitle(selected.title);
                      setEditContent(selected.content);
                      setShowEditPub(true);
                    }}
                  >
                    <Feather name="edit-2" size={14} color={colors.primary} />
                    <Text style={[styles.adminBtnText, { color: colors.primary }]}>{t("pubAdminEdit")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.adminBtn, { borderColor: "#ef444440", backgroundColor: "#ef444408" }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      Alert.alert(t("pubDeleteConfirmTitle"), t("pubDeleteConfirmMsg"), [
                        { text: t("pubEditCancel"), style: "cancel" },
                        { text: t("pubDeleteConfirmOk"), style: "destructive", onPress: () => { setSelected(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } },
                      ]);
                    }}
                  >
                    <Feather name="trash-2" size={14} color="#ef4444" />
                    <Text style={[styles.adminBtnText, { color: "#ef4444" }]}>{t("pubAdminDelete")}</Text>
                  </TouchableOpacity>
                  {!selected.pinned ? (
                    <TouchableOpacity
                      style={[styles.adminBtn, { borderColor: "#f59e0b40", backgroundColor: "#f59e0b08" }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        showToast({ type: "info", title: t("pubPinnedToast"), message: t("pubPinnedMsg") });
                        setSelected(null);
                      }}
                    >
                      <Feather name="bookmark" size={14} color="#f59e0b" />
                      <Text style={[styles.adminBtnText, { color: "#f59e0b" }]}>{t("pubAdminPin")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Create publication modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("pubCreateTitle")}</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("pubFieldCategory")}</Text>
              <FlatList
                horizontal
                data={Object.entries(CAT_COLORS)}
                keyExtractor={([k]) => k}
                contentContainerStyle={{ gap: 8 }}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item: [cat, color] }) => (
                  <TouchableOpacity
                    style={[styles.catChip, { backgroundColor: newCategory === cat ? color : colors.card, borderColor: newCategory === cat ? color : colors.border }]}
                    onPress={() => setNewCategory(cat)}
                  >
                    <Text style={[styles.catLabel, { color: newCategory === cat ? "#fff" : colors.mutedForeground }]}>{cat}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("pubFieldTitle")}</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder={t("pubTitlePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("pubFieldContent")}</Text>
              <TextInput
                style={[styles.fieldInput, styles.contentArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                value={newContent}
                onChangeText={setNewContent}
                placeholder={t("pubContentPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>

            <TouchableOpacity
              style={[styles.publishBtn, { backgroundColor: newTitle.trim() && newContent.trim() ? colors.primary : colors.muted }]}
              onPress={handleCreate}
              disabled={!newTitle.trim() || !newContent.trim()}
            >
              <Feather name="send" size={16} color={newTitle.trim() && newContent.trim() ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.publishBtnText, { color: newTitle.trim() && newContent.trim() ? "#fff" : colors.mutedForeground }]}>
                {t("pubPublishBtn")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit publication modal */}
      <Modal visible={showEditPub} transparent animationType="slide" onRequestClose={() => setShowEditPub(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 16 }} />
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>{t("pubEditTitle")}</Text>
              <TouchableOpacity onPress={() => setShowEditPub(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1 }}>{t("pubEditFieldTitle")}</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: 12, fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder={t("pubTitlePlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1 }}>{t("pubEditFieldContent")}</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, minHeight: 120, textAlignVertical: "top" }}
                  value={editContent}
                  onChangeText={setEditContent}
                  placeholder={t("pubContentPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}
                  onPress={() => setShowEditPub(false)}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>{t("pubEditCancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary }}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setShowEditPub(false);
                    setSelected(null);
                    showToast({ type: "success", title: t("pubUpdatedToast"), message: t("pubUpdatedMsg") });
                  }}
                >
                  <Feather name="check" size={15} color="#fff" />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>{t("pubEditSave")}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Comments modal */}
      <Modal visible={showComments} transparent animationType="slide" onRequestClose={() => setShowComments(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "80%" }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 16 }} />
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                {t("pubCommentsTitle")} {selected ? `(${(commentsByPub[selected.id] ?? []).length + selected.comments})` : ""}
              </Text>
              <TouchableOpacity onPress={() => setShowComments(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              {selected && (commentsByPub[selected.id] ?? []).map((c, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary }}>{t("pubCommentMe")}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground }}>{c}</Text>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 }}>{t("pubCommentJustNow")}</Text>
                  </View>
                </View>
              ))}
              {selected && (commentsByPub[selected.id] ?? []).length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <Feather name="message-circle" size={28} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 8 }}>{t("pubCommentsEmpty")}</Text>
                </View>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TextInput
                style={{ flex: 1, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}
                value={commentText}
                onChangeText={setCommentText}
                placeholder={t("pubCommentPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
              />
              <TouchableOpacity
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: commentText.trim() ? colors.primary : colors.secondary, alignItems: "center", justifyContent: "center" }}
                onPress={() => {
                  if (!commentText.trim() || !selected) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCommentsByPub((prev) => ({ ...prev, [selected.id]: [...(prev[selected.id] ?? []), commentText.trim()] }));
                  setCommentText("");
                }}
                disabled={!commentText.trim()}
              >
                <Feather name="send" size={18} color={commentText.trim() ? "#fff" : colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>
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
  createBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  catChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  catLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  catLabel2: { fontSize: 10, fontFamily: "Inter_700Bold" },
  pubCard: { borderRadius: 16, borderWidth: 1, borderLeftWidth: 4, padding: 16, gap: 10 },
  pinnedBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 2 },
  pinnedText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" },
  pubMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pubDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  pubTitle: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 21 },
  pubContent: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  pubFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pubAuthorRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  authorAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  authorInitials: { fontSize: 10, fontFamily: "Inter_700Bold" },
  pubAuthor: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pubActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  readMore: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  shareBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  articleMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  articleTitle: { fontSize: 20, fontFamily: "Inter_700Bold", lineHeight: 28 },
  articleAuthor: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  authorAvatarLg: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  authorInitialsLg: { fontSize: 16, fontFamily: "Inter_700Bold" },
  articleAuthorName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  articleAuthorRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
  articleContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 24 },
  engagementRow: { flexDirection: "row", gap: 10, paddingTop: 12, borderTopWidth: 1 },
  engBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  engBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  adminActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  adminBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  adminBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fieldInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  contentArea: { minHeight: 120, textAlignVertical: "top" },
  publishBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 14 },
  publishBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
});

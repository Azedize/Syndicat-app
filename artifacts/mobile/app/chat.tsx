import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
import { useData, type ChatConversation } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { chat as chatApi } from "@/services/api";
import EmptyState from "@/components/EmptyState";
import FilterChips from "@/components/FilterChips";
import { useToast } from "@/context/ToastContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "direct" | "group" | "announcement";

interface ContactUser {
  id: string;
  userId?: string | null;
  name: string;
  email: string;
  role?: string | null;
  status?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function convIcon(c: ChatConversation): keyof typeof Feather.glyphMap {
  if (c.convType === "group" || c.isGroup) return "users";
  if (c.convType === "announcement") return "bell";
  if (c.convType === "support") return "life-buoy";
  if (c.convType === "building") return "home";
  return "message-circle";
}

function convAccent(c: ChatConversation, primary: string) {
  if (c.convType === "announcement") return "#f59e0b";
  if (c.convType === "support") return "#ef4444";
  if (c.convType === "building") return "#10b981";
  return primary;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { conversations, refreshConversations, deleteConversation, markConversationRead } = useData();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [showNew, setShowNew] = useState(false);
  const [showGroupNew, setShowGroupNew] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<ContactUser[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [creatingConv, setCreatingConv] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Group creation state
  const [groupName, setGroupName] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<ContactUser[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const { showToast } = useToast();

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  // ─── Filtering ─────────────────────────────────────────────────────────────

  const applyFilter = (list: ChatConversation[]) => {
    let result = list;
    if (filterTab !== "all") {
      result = result.filter((c) => {
        if (filterTab === "direct") return c.convType === "direct" && !c.isGroup;
        if (filterTab === "group") return c.isGroup || c.convType === "group";
        if (filterTab === "announcement") return c.convType === "announcement";
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.participant.toLowerCase().includes(q) ||
          c.lastMessage.toLowerCase().includes(q),
      );
    }
    return result;
  };

  const filtered = applyFilter(conversations);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const openThread = (c: ChatConversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markConversationRead(c.id);
    router.push({ pathname: "/chat-thread", params: { id: c.id } });
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshConversations();
    } catch {
      showToast({ type: "error", title: t("error"), message: t("noData") });
    } finally {
      setRefreshing(false);
    }
  }, [refreshConversations]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLongPress = (c: ChatConversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(c.participant, undefined, [
      { text: t("cancel"), style: "cancel" },
      { text: t("viewDetails"), onPress: () => openThread(c) },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () =>
          Alert.alert(
            t("delete"),
            undefined,
            [
              { text: t("cancel"), style: "cancel" },
              { text: t("delete"), style: "destructive", onPress: () => { deleteConversation(c.id); } },
            ],
          ),
      },
    ]);
  };

  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      // Use the role-filtered contactable-users endpoint so the picker only
      // shows users the current actor is actually allowed to message, matching
      // the server-side communication matrix enforced in canDirectMessage().
      const res = await chatApi.contactableUsers() as any;
      const rows: ContactUser[] = Array.isArray(res?.data) ? res.data : [];
      setContacts(rows);
    } catch {
      setContacts([]);
      showToast({ type: "error", title: t("error"), message: t("chatContactsError") });
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleOpenNew = () => {
    setShowNew(true);
    setContactSearch("");
    loadContacts();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleStartConversation = async (contact: ContactUser) => {
    if (creatingConv) return;
    const participantUserId = contact.userId ?? contact.id;
    setCreatingConv(contact.id);
    try {
      const res = await chatApi.create({ participantId: participantUserId, convType: "direct" }) as any;
      const convId = res?.data?.id;
      if (convId) {
        setShowNew(false);
        setCreatingConv(null);
        await refreshConversations();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push({ pathname: "/chat-thread", params: { id: convId } });
      }
    } catch {
      setCreatingConv(null);
      showToast({ type: "error", title: t("error"), message: t("chatConvError") });
    }
  };

  const handleCreateGroup = async () => {
    if (creatingGroup || !groupName.trim() || selectedContacts.length === 0) return;
    setCreatingGroup(true);
    try {
      const participantIds = selectedContacts.map((c) => c.userId ?? c.id);
      const res = await chatApi.create({
        convType: "group",
        isGroup: true,
        name: groupName.trim(),
        participantIds,
      }) as any;
      const convId = res?.data?.id;
      if (convId) {
        setShowGroupNew(false);
        setGroupName("");
        setSelectedContacts([]);
        await refreshConversations();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push({ pathname: "/chat-thread", params: { id: convId } });
      }
    } catch {
      showToast({ type: "error", title: t("error"), message: t("chatGroupError") });
    } finally {
      setCreatingGroup(false);
    }
  };

  const toggleContact = (contact: ContactUser) => {
    Haptics.selectionAsync();
    setSelectedContacts((prev) => {
      const exists = prev.find((c) => c.id === contact.id);
      return exists ? prev.filter((c) => c.id !== contact.id) : [...prev, contact];
    });
  };

  const filteredContacts = contactSearch.trim()
    ? contacts.filter((c) => c.name.toLowerCase().includes(contactSearch.toLowerCase()))
    : contacts;

  // ─── Render ────────────────────────────────────────────────────────────────

  const unreadFor = (key: FilterTab) => {
    if (key === "all") return totalUnread;
    return conversations
      .filter((c) => {
        if (key === "direct") return c.convType === "direct" && !c.isGroup;
        if (key === "group") return c.isGroup || c.convType === "group";
        if (key === "announcement") return c.convType === "announcement";
        return false;
      })
      .reduce((s, c) => s + c.unread, 0);
  };

  const FILTER_TABS: { key: FilterTab; label: string; unread: number }[] = [
    { key: "all", label: t("all"), unread: unreadFor("all") },
    { key: "direct", label: t("chat"), unread: unreadFor("direct") },
    { key: "group", label: t("members"), unread: unreadFor("group") },
    { key: "announcement", label: t("announcements"), unread: unreadFor("announcement") },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("chatTitle")}</Text>
          {totalUnread > 0 ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {totalUnread} message{totalUnread > 1 ? "s" : ""}
            </Text>
          ) : (
            <Text style={[styles.subtitle, { color: colors.success }]}>✓</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.secondary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert(t("newConversation"), undefined, [
              { text: t("cancel"), style: "cancel" },
              { text: t("chat"), onPress: handleOpenNew },
              {
                text: t("newConversation"),
                onPress: () => {
                  setShowGroupNew(true);
                  setSelectedContacts([]);
                  setGroupName("");
                  loadContacts();
                },
              },
            ]);
          }}
        >
          <Feather name="edit" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { margin: 12, marginBottom: 0, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={t("searchConversations")}
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter tabs — fixed-height bar; never resizes when the active
          filter's data (or lack of it) changes. Counts still update, but
          the bar's own height/spacing/scroll behavior stays constant. */}
      <FilterChips
        options={FILTER_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          count: tab.unread > 0 ? tab.unread : undefined,
        }))}
        value={filterTab}
        onChange={(key) => setFilterTab(key as FilterTab)}
        accentColor={colors.primary}
      />

      {/* Conversation list — the only part of this screen that scrolls.
          When the active filter has no results, contentContainerStyle
          switches to flexGrow: 1 so the EmptyState fills the remaining
          space below the filter bar instead of leaving a stray gap or
          pushing the filter bar around. */}
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={
          filtered.length === 0
            ? styles.listEmptyContainer
            : { paddingHorizontal: 12, gap: 2, paddingBottom: insets.bottom + 40 }
        }
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={({ item: c }) => {
          const accent = convAccent(c, colors.primary);
          const icon = convIcon(c);
          const isGroup = c.isGroup || c.convType === "group";
          return (
            <TouchableOpacity
              style={[
                styles.convRow,
                {
                  borderBottomColor: colors.border,
                  backgroundColor: c.unread > 0 ? colors.primary + "05" : "transparent",
                },
              ]}
              onPress={() => openThread(c)}
              onLongPress={() => handleLongPress(c)}
              activeOpacity={0.7}
            >
              {/* Avatar */}
              <View style={[styles.avatar, { backgroundColor: accent + "18" }]}>
                {isGroup || c.convType !== "direct" ? (
                  <Feather name={icon} size={20} color={accent} />
                ) : (
                  <Text style={[styles.avatarText, { color: accent }]}>
                    {c.participant.split(" ")[0].slice(0, 2).toUpperCase()}
                  </Text>
                )}
                {c.unread > 0 && (
                  <View style={[styles.avatarBadge, { backgroundColor: accent }]}>
                    <Text style={styles.avatarBadgeText}>{c.unread > 9 ? "9+" : c.unread}</Text>
                  </View>
                )}
              </View>

              {/* Content */}
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={[styles.convName, { color: colors.foreground, fontFamily: c.unread > 0 ? "Inter_700Bold" : "Inter_600SemiBold", flex: 1 }]}
                    numberOfLines={1}
                  >
                    {c.participant}
                  </Text>
                  <Text style={[styles.convTime, { color: colors.mutedForeground }]}>{c.time}</Text>
                </View>
                <Text
                  style={[styles.convMsg, { color: c.unread > 0 ? colors.foreground : colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {c.lastMessage || t("typeMessage")}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="message-circle"
            title={search ? t("noData") : t("noConversations")}
            description={search ? `${t("noData")} "${search}"` : t("noConversations")}
            actionLabel={!search ? t("newConversation") : undefined}
            onAction={!search ? handleOpenNew : undefined}
          />
        }
      />

      {/* ─── Direct conversation modal ───────────────────────────────────── */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("newConversation")}</Text>
            <TouchableOpacity onPress={() => setShowNew(false)} style={{ padding: 4 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card, margin: 16 }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder={t("searchConversations")}
              placeholderTextColor={colors.mutedForeground}
              value={contactSearch}
              onChangeText={setContactSearch}
              autoFocus
            />
            {contactSearch ? (
              <TouchableOpacity onPress={() => setContactSearch("")}>
                <Feather name="x" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, paddingHorizontal: 20, marginBottom: 4 }]}>
            {filteredContacts.length}
          </Text>

          {loadingContacts ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView>
              {filteredContacts.map((contact) => (
                <TouchableOpacity
                  key={contact.id}
                  style={[styles.contactRow, { borderBottomColor: colors.border }]}
                  onPress={() => handleStartConversation(contact)}
                  disabled={!!creatingConv}
                >
                  <View style={[styles.contactAvatar, { backgroundColor: colors.primary + "20" }]}>
                    {creatingConv === contact.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.contactInitials, { color: colors.primary }]}>
                        {contact.name.split(" ")[0].slice(0, 2).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.contactName, { color: colors.foreground }]}>{contact.name}</Text>
                    <Text style={[styles.contactRole, { color: colors.mutedForeground }]}>
                      {contact.role === "syndicate_admin"
                        ? t("roleSyndicAdmin")
                        : contact.role === "super_admin"
                          ? t("roleSuperAdmin")
                          : t("roleMember")}
                    </Text>
                  </View>
                  <Feather name="message-square" size={16} color={colors.primary} />
                </TouchableOpacity>
              ))}
              {filteredContacts.length === 0 && !loadingContacts && (
                <View style={styles.empty}>
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noMembers")}</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ─── Group creation modal ────────────────────────────────────────── */}
      <Modal visible={showGroupNew} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("newConversation")}</Text>
            <TouchableOpacity onPress={() => setShowGroupNew(false)} style={{ padding: 4 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Group name */}
            <View>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>{t("nameLabel")} *</Text>
              <TextInput
                style={[styles.nameInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                value={groupName}
                onChangeText={setGroupName}
                placeholder={t("nameLabel")}
                placeholderTextColor={colors.mutedForeground}
                maxLength={60}
              />
            </View>

            {/* Selected members */}
            {selectedContacts.length > 0 && (
              <View>
                <Text style={[styles.formLabel, { color: colors.foreground }]}>
                  {t("members")} ({selectedContacts.length})
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {selectedContacts.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.selectedChip, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" }]}
                      onPress={() => toggleContact(c)}
                    >
                      <Text style={[styles.selectedChipText, { color: colors.primary }]}>{c.name.split(" ")[0]}</Text>
                      <Feather name="x" size={12} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Contact search */}
            <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder={t("search")}
                placeholderTextColor={colors.mutedForeground}
                value={contactSearch}
                onChangeText={setContactSearch}
              />
            </View>

            {loadingContacts ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = !!selectedContacts.find((c) => c.id === contact.id);
                return (
                  <TouchableOpacity
                    key={contact.id}
                    style={[styles.contactRow, { borderBottomColor: colors.border, paddingHorizontal: 0 }]}
                    onPress={() => toggleContact(contact)}
                  >
                    <View style={[
                      styles.contactAvatar,
                      { backgroundColor: isSelected ? colors.primary : colors.primary + "20" },
                    ]}>
                      {isSelected ? (
                        <Feather name="check" size={16} color="#fff" />
                      ) : (
                        <Text style={[styles.contactInitials, { color: colors.primary }]}>
                          {contact.name.split(" ")[0].slice(0, 2).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.contactName, { color: colors.foreground }]}>{contact.name}</Text>
                      <Text style={[styles.contactRole, { color: colors.mutedForeground }]}>
                        {contact.role === "syndicate_admin" ? t("roleSyndicAdmin") : t("roleMember")}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {/* Create button */}
            <TouchableOpacity
              style={[
                styles.createGroupBtn,
                {
                  backgroundColor:
                    groupName.trim() && selectedContacts.length > 0
                      ? colors.primary
                      : colors.muted,
                },
              ]}
              onPress={handleCreateGroup}
              disabled={!groupName.trim() || selectedContacts.length === 0 || creatingGroup}
            >
              {creatingGroup ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="users" size={16} color="#fff" />
                  <Text style={styles.createGroupBtnText}>
                    {t("create")} ({selectedContacts.length})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  // Fills the space below the filter bar so EmptyState can center itself
  // there without the FlatList adding its own scrollable padding/gaps.
  listEmptyContainer: { flexGrow: 1 },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarText: { fontSize: 17, fontFamily: "Inter_700Bold" },
  avatarBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  convName: { fontSize: 14 },
  convTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  convMsg: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  empty: { alignItems: "center", gap: 12, marginTop: 48, paddingHorizontal: 32 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  contactsLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: 1,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  contactInitials: { fontSize: 15, fontFamily: "Inter_700Bold" },
  contactName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  contactRole: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  formLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  selectedChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  createGroupBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  createGroupBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});

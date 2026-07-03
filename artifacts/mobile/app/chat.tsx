import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";

interface ContactUser {
  id: string;
  userId?: string | null;
  name: string;
  email: string;
  role?: string | null;
  status?: string;
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { conversations } = useData();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<ContactUser[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [creatingConv, setCreatingConv] = useState<string | null>(null);
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  const filtered = conversations.filter(
    (c) =>
      !search ||
      c.participant.toLowerCase().includes(search.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(search.toLowerCase()),
  );

  const openThread = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/chat-thread", params: { id } });
  };

  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      const res = await apiRequest<{ data: ContactUser[] }>("/members", "GET", undefined, token);
      const rows: ContactUser[] = Array.isArray(res?.data) ? res.data : [];
      setContacts(rows.filter((c) => c.id !== user?.id && c.id !== (user as any)?.userId));
    } catch {
      setContacts([]);
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
      const res = await apiRequest<{ data: { id: string } }>(
        "/conversations",
        "POST",
        { participantId: participantUserId, isGroup: false },
        token,
      );
      const convId = res?.data?.id;
      if (convId) {
        setShowNew(false);
        setCreatingConv(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push({ pathname: "/chat-thread", params: { id: convId } });
      }
    } catch {
      setCreatingConv(null);
    }
  };

  const filteredContacts = contactSearch.trim()
    ? contacts.filter((c) => c.name.toLowerCase().includes(contactSearch.toLowerCase()))
    : contacts;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Chat Hub</Text>
          {totalUnread > 0 ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {totalUnread} message(s) non lu(s)
            </Text>
          ) : (
            <Text style={[styles.subtitle, { color: colors.success }]}>Tout lu ✓</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
          onPress={handleOpenNew}
        >
          <Feather name="edit" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { margin: 16, marginBottom: 8, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Rechercher une conversation..."
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

      {/* Groups section */}
      {!search && conversations.filter((c) => c.role === "Groupe").length > 0 ? (
        <View style={styles.groupsRow}>
          {conversations.filter((c) => c.role === "Groupe").map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[styles.groupChip, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => openThread(g.id)}
            >
              <View style={[styles.groupIcon, { backgroundColor: colors.primary + "20" }]}>
                <Feather name="users" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.groupName, { color: colors.foreground }]} numberOfLines={1}>
                {g.participant.replace("Groupe - ", "")}
              </Text>
              {g.unread > 0 ? (
                <View style={[styles.groupBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.groupBadgeText}>{g.unread}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 2, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {search ? "Résultats" : "Messages directs"}
          </Text>
        }
        renderItem={({ item: c }) => (
          <TouchableOpacity
            style={[
              styles.convRow,
              {
                borderBottomColor: colors.border,
                backgroundColor: c.unread > 0 ? colors.primary + "05" : "transparent",
              },
            ]}
            onPress={() => openThread(c.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
              {c.role === "Groupe" ? (
                <Feather name="users" size={20} color={colors.primary} />
              ) : (
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {c.participant.split(" ")[0].slice(0, 2).toUpperCase()}
                </Text>
              )}
              <View style={[styles.onlineDot, { backgroundColor: colors.border, borderColor: colors.card }]} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={[styles.convName, { color: colors.foreground, fontFamily: c.unread > 0 ? "Inter_700Bold" : "Inter_600SemiBold" }]}
                numberOfLines={1}
              >
                {c.participant}
              </Text>
              <Text style={[styles.convMsg, { color: c.unread > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                {c.lastMessage || "Démarrer la conversation..."}
              </Text>
            </View>
            <View style={styles.convRight}>
              <Text style={[styles.convTime, { color: colors.mutedForeground }]}>{c.time}</Text>
              {c.unread > 0 ? (
                <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.unreadText}>{c.unread}</Text>
                </View>
              ) : (
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "15" }]}>
              <Feather name="message-circle" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucune conversation</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Appuyez sur le bouton ✏️ pour démarrer une conversation avec un membre du syndicat.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={handleOpenNew}
            >
              <Feather name="edit" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Nouvelle conversation</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* New conversation modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouvelle conversation</Text>
            <TouchableOpacity onPress={() => setShowNew(false)} style={{ padding: 4 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={[styles.modalSearch, { borderColor: colors.border, backgroundColor: colors.card, margin: 16 }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Rechercher un contact..."
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

          <Text style={[styles.contactsLabel, { color: colors.mutedForeground, paddingHorizontal: 20 }]}>
            {filteredContacts.length} MEMBRE(S) DISPONIBLE(S)
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
                      {contact.role === "syndicate_admin" ? "Gestionnaire syndicat"
                        : contact.role === "super_admin" ? "Super administrateur"
                        : "Copropriétaire"}
                    </Text>
                  </View>
                  <Feather name="message-square" size={16} color={colors.primary} />
                </TouchableOpacity>
              ))}
              {filteredContacts.length === 0 && !loadingContacts && (
                <View style={styles.empty}>
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun membre trouvé</Text>
                </View>
              )}
            </ScrollView>
          )}
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
  newBtn: {
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
  groupsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  groupChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  groupIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  groupName: { fontSize: 12, fontFamily: "Inter_600SemiBold", maxWidth: 130 },
  groupBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  groupBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 4,
  },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: 1,
    borderRadius: 4,
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
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  convName: { fontSize: 14 },
  convMsg: { fontSize: 12, fontFamily: "Inter_400Regular" },
  convRight: { alignItems: "flex-end", gap: 6 },
  convTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  empty: { alignItems: "center", gap: 12, marginTop: 48, paddingHorizontal: 32 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  emptyBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSearch: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  contactsLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
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
});

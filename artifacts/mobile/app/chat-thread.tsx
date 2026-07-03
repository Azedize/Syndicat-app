import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { shareContent } from "@/hooks/useShare";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chat as chatApi } from "@/services/api";
import { useData, type ChatMessage } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

export default function ChatThreadScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conversations, messages, sendMessage } = useData();
  const [text, setText] = useState("");
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<FlatList>(null);
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const conversation = conversations.find((c) => c.id === id);

  // Load historical messages from API when entering thread, with cancellation guard
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    chatApi.messages(id)
      .then((res: any) => {
        if (cancelled) return;
        const rows: any[] = res?.data ?? [];
        setApiMessages(rows.map((r: any) => ({
          id: String(r.id),
          conversationId: id, // tag with current id so stale responses are filterable
          sender: String(r.senderName ?? r.sender ?? ""),
          text: String(r.text ?? r.content ?? ""),
          time: r.createdAt
            ? new Date(r.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
            : String(r.time ?? ""),
          isMe: Boolean(r.isMe ?? false),
        })));
      })
      .catch(() => {/* keep showing optimistic messages on API failure */});
    return () => { cancelled = true; };
  }, [id]);

  // Merge: show API history + optimistic "isMe" messages not yet echoed by server.
  // Optimistic messages use temp IDs (m<timestamp>) that won't match server UUIDs, so
  // we deduplicate by matching text+sender instead of ID to avoid double-rendering.
  const apiMsgsForThread = apiMessages.filter((m) => m.conversationId === id);
  const apiTexts = new Set(apiMsgsForThread.filter((m) => m.isMe).map((m) => m.text));
  const localPending = messages.filter(
    (m) => m.conversationId === id && m.isMe && !apiTexts.has(m.text),
  );
  const threadMessages = [...apiMsgsForThread, ...localPending];

  const handleSend = () => {
    if (!text.trim() || !id) return;
    sendMessage(id, text.trim());
    setText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  if (!conversation) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground, padding: 20 }}>Conversation introuvable</Text>
      </View>
    );
  }

  const isGroup = conversation.role === "Groupe";

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
          {isGroup ? (
            <Feather name="users" size={18} color={colors.primary} />
          ) : (
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {conversation.participant.split(" ")[0].slice(0, 2).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerName, { color: colors.foreground }]} numberOfLines={1}>
            {conversation.participant}
          </Text>
          <View style={styles.onlineRow}>
            <View style={[styles.onlineDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.onlineLabel, { color: colors.mutedForeground }]}>{conversation.role}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.headerBtn, { backgroundColor: colors.secondary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Alert.alert("Appel vocal", `Appeler ${conversation.participant}?`, [
              { text: "Annuler", style: "cancel" },
              { text: "Appeler", onPress: () => Linking.openURL("tel:").catch(() => Alert.alert("Indisponible", "Numéro non disponible.")) },
            ]);
          }}
        >
          <Feather name="phone" size={16} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerBtn, { backgroundColor: colors.secondary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert("Options", undefined, [
              { text: "Annuler", style: "cancel" },
              { text: "Partager la conversation", onPress: () => shareContent(`Conversation avec ${conversation.participant} sur SYNDYCAT`) },
              { text: "Supprimer la conversation", style: "destructive", onPress: () => { router.back(); } },
            ]);
          }}
        >
          <Feather name="more-vertical" size={16} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={threadMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <View style={[styles.emptyChatIcon, { backgroundColor: colors.primary + "15" }]}>
              <Feather name="message-circle" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyChatText, { color: colors.mutedForeground }]}>
              Commencez la conversation
            </Text>
          </View>
        }
        renderItem={({ item: msg, index }) => {
          const prev = threadMessages[index - 1];
          const showSender = !msg.isMe && (!prev || prev.sender !== msg.sender);
          return (
            <View style={[styles.msgRow, msg.isMe && styles.msgRowMe]}>
              {!msg.isMe && isGroup && (
                <View style={[styles.msgAvatar, { backgroundColor: colors.primary + "20" }]}>
                  <Text style={[styles.msgAvatarText, { color: colors.primary }]}>
                    {msg.sender.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={[styles.msgGroup, msg.isMe && { alignItems: "flex-end" }]}>
                {showSender && (
                  <Text style={[styles.msgSender, { color: colors.primary }]}>{msg.sender}</Text>
                )}
                <View
                  style={[
                    styles.bubble,
                    msg.isMe
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                  ]}
                >
                  <Text style={[styles.bubbleText, { color: msg.isMe ? "#fff" : colors.foreground }]}>
                    {msg.text}
                  </Text>
                </View>
                <Text style={[styles.msgTime, { color: colors.mutedForeground }]}>{msg.time}</Text>
              </View>
            </View>
          );
        }}
      />

      {/* Input */}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.attachBtn, { backgroundColor: colors.secondary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert("Pièce jointe", "Choisissez le type de fichier à envoyer:", [
              { text: "Annuler", style: "cancel" },
              { text: "Photo", onPress: () => Alert.alert("Photo", "Fonctionnalité bientôt disponible — l'accès à la galerie photo sera activé dans la prochaine version.") },
              { text: "Document", onPress: () => Alert.alert("Document", "Fonctionnalité bientôt disponible — le partage de fichiers sera activé dans la prochaine version.") },
            ]);
          }}
        >
          <Feather name="paperclip" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TextInput
          style={[styles.msgInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          value={text}
          onChangeText={setText}
          placeholder="Écrire un message..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={500}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.muted }]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <Feather name="send" size={18} color={text.trim() ? "#fff" : colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  headerName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyChat: { alignItems: "center", gap: 12, marginTop: 60 },
  emptyChatIcon: {
    width: 70,
    height: 70,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyChatText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowMe: { justifyContent: "flex-end" },
  msgAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  msgAvatarText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  msgGroup: { maxWidth: "75%", gap: 3 },
  msgSender: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginLeft: 4 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 19 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginLeft: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  msgInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { shareContent } from "@/hooks/useShare";
import { useLanguage } from "@/context/LanguageContext";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  pickAndUploadPhoto,
  pickAndUploadDocument,
  captureAndUploadPhoto,
  type UploadResult,
  MAX_ATTACHMENT_SIZE,
} from "@/lib/upload";
import { getApiBaseUrl } from "@/services/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chat as chatApi } from "@/services/api";
import { useData, type ChatMessage } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import EmptyState from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";

// ─── Common emojis for the picker panel ──────────────────────────────────────
const EMOJI_GRID = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "😂",
  "🤣",
  "😊",
  "😇",
  "🙂",
  "🙃",
  "😉",
  "😌",
  "😍",
  "🥰",
  "😘",
  "😗",
  "😙",
  "😚",
  "😋",
  "😛",
  "😜",
  "🤪",
  "😝",
  "🤑",
  "🤗",
  "🤭",
  "🤫",
  "🤔",
  "🤐",
  "🤨",
  "😐",
  "😑",
  "😶",
  "😏",
  "😒",
  "🙄",
  "😬",
  "🤥",
  "😔",
  "😪",
  "🤤",
  "😴",
  "😷",
  "🤒",
  "🤕",
  "🤢",
  "🤮",
  "🥵",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🤝",
  "👊",
  "✊",
  "🤜",
  "🤛",
  "🤞",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "🤍",
  "💯",
  "🔥",
  "🎉",
  "🎊",
  "✨",
  "💫",
  "⭐",
  "🌟",
  "💥",
  "🚀",
  "🌈",
  "🍀",
];

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function getAttachmentBaseUrl(): string {
  return getApiBaseUrl();
}

function resolveAttachmentUrl(
  raw: string | null | undefined,
  token: string | null,
): string | null {
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  // objectPath starts with /objects/ → serve via /storage/objects/
  if (raw.startsWith("/objects/") && token)
    return `${getAttachmentBaseUrl()}/storage${raw}?token=${encodeURIComponent(token)}`;
  if (raw.startsWith("/objects/")) return null;
  return `${getAttachmentBaseUrl()}/storage/public-objects/${raw}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ChatThreadScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [text, setText] = useState("");
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<FlatList>(null);
  const lastMessageAtRef = useRef<string | null>(null);
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  const isRTL = I18nManager.isRTL;

  const {
    conversations,
    messages,
    sendMessage,
    markConversationRead,
    deleteConversation,
  } = useData();
  const conversation = conversations.find((c) => c.id === id);
  const [isBlocked, setIsBlocked] = useState(!!conversation?.isBlocked);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const typingSentAtRef = useRef(0);

  // ─── Upload state ─────────────────────────────────────────────────────────
  const [messagesError, setMessagesError] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  // ─── Upload state ─────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-1

  // ─── Emoji picker state ───────────────────────────────────────────────────
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // ─── Attachment picker sheet ───────────────────────────────────────────────
  const [showAttachSheet, setShowAttachSheet] = useState(false);

  // ─── Full-screen image viewer ─────────────────────────────────────────────
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);

  // ─── Message edit mode ────────────────────────────────────────────────────
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    setIsBlocked(!!conversation?.isBlocked);
  }, [conversation?.isBlocked]);

  function mapApiMessage(r: any): ChatMessage {
    return {
      id: String(r.id),
      conversationId: id,
      sender: String(r.senderName ?? r.sender ?? ""),
      senderId: String(r.senderId ?? ""),
      text: String(r.text ?? r.content ?? ""),
      time: r.createdAt
        ? new Date(r.createdAt).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : String(r.time ?? ""),
      isMe: Boolean(r.isMe ?? false),
      messageType: r.messageType ?? "text",
      attachmentUrl: r.attachmentUrl ?? null,
      attachmentType: r.attachmentType ?? null,
      attachmentName: r.attachmentName ?? null,
      durationSeconds: r.durationSeconds ?? null,
      reactions: Array.isArray(r.reactions) ? r.reactions : [],
      createdAt: r.createdAt ? String(r.createdAt) : undefined,
      editedAt: r.editedAt ? String(r.editedAt) : null,
      isDeletedForEveryone: Boolean(r.isDeletedForEveryone ?? false),
    };
  }

  // Load historical messages on mount (or retry); mark conversation as read
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadingMessages(true);
    setMessagesError(false);
    chatApi
      .messages(id)
      .then((res: any) => {
        if (cancelled) return;
        const rows: any[] = res?.data ?? [];
        const mapped = rows.map(mapApiMessage);
        setApiMessages(mapped);
        if (mapped.length > 0) {
          lastMessageAtRef.current =
            mapped[mapped.length - 1].createdAt ?? null;
        }
      })
      .catch(() => {
        if (!cancelled) setMessagesError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    markConversationRead(id);
    return () => {
      cancelled = true;
    };
  }, [id, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for new messages, edits, deletions, and typing every 4 seconds
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(async () => {
      try {
        const since = lastMessageAtRef.current ?? new Date(0).toISOString();
        const res = (await chatApi.since(id, since)) as any;
        const rows: any[] = res?.data ?? [];
        if (rows.length > 0) {
          const mapped = rows.map(mapApiMessage);
          setApiMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const fresh = mapped.filter((m) => !existingIds.has(m.id));
            // Updated messages (edited / deleted) that already exist locally
            const updated = mapped.filter((m) => existingIds.has(m.id));
            let result =
              updated.length > 0
                ? prev.map((m) => {
                    const u = updated.find((u) => u.id === m.id);
                    return u ?? m;
                  })
                : prev;
            if (fresh.length > 0) {
              lastMessageAtRef.current =
                fresh[fresh.length - 1].createdAt ?? null;
              if (fresh.some((m) => !m.isMe)) {
                setTimeout(
                  () => listRef.current?.scrollToEnd({ animated: true }),
                  100,
                );
                markConversationRead(id);
              }
              result = [...result, ...fresh];
            }
            return result;
          });
        }
        setTypingUsers((res as any)?.typing ?? []);
      } catch {
        /* keep showing stale */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge API history + optimistic local messages
  const apiMsgsForThread = apiMessages.filter((m) => m.conversationId === id);
  const apiTexts = new Set(
    apiMsgsForThread.filter((m) => m.isMe).map((m) => m.text),
  );
  const localPending = messages.filter(
    (m) => m.conversationId === id && m.isMe && !apiTexts.has(m.text),
  );
  const threadMessages = [...apiMsgsForThread, ...localPending];

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = () => {
    if (!text.trim() || !id || isBlocked) return;
    sendMessage(id, text.trim());
    setText("");
    setShowEmojiPicker(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (!id || isBlocked) return;
    const now = Date.now();
    if (now - typingSentAtRef.current > 2500) {
      typingSentAtRef.current = now;
      chatApi.typing(id).catch(() => {});
    }
  };

  const handleToggleBlock = () => {
    if (!conversation?.participantId) return;
    const targetId = conversation.participantId;
    if (isBlocked) {
      chatApi
        .unblockUser(targetId)
        .then(() => {
          setIsBlocked(false);
          Alert.alert(t("userUnblockedTitle"));
        })
        .catch(() => Alert.alert(t("error")));
    } else {
      Alert.alert(t("blockUser"), t("blockUserConfirm"), [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("blockUser"),
          style: "destructive",
          onPress: () => {
            chatApi
              .blockUser(targetId)
              .then(() => {
                setIsBlocked(true);
                Alert.alert(t("userBlockedTitle"));
              })
              .catch(() => Alert.alert(t("error")));
          },
        },
      ]);
    }
  };

  const handleSubmitReport = async () => {
    if (!id || !reportReason.trim()) return;
    try {
      await chatApi.reportAbuse({
        conversationId: id,
        reportedUserId: conversation?.participantId ?? undefined,
        reason: reportReason.trim(),
      });
      setReportModalVisible(false);
      setReportReason("");
      Alert.alert(t("reportSentTitle"), t("reportSentMsg"));
    } catch {
      Alert.alert(t("error"));
    }
  };

  const handleToggleReaction = async (
    messageId: string,
    emoji: string,
    alreadyMine: boolean,
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (alreadyMine) await chatApi.unreact(messageId, emoji);
      else await chatApi.react(messageId, emoji);
      const res = (await chatApi.messages(id!)) as any;
      setApiMessages((res?.data ?? []).map(mapApiMessage));
    } catch {
      /* best-effort */
    }
  };

  const handleAttach = async (mode: "camera" | "gallery" | "document") => {
    if (!id || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      let result: UploadResult | undefined;
      const onProgress = (p: number) => setUploadProgress(p);

      if (mode === "camera") {
        result = await captureAndUploadPhoto(onProgress);
      } else if (mode === "gallery") {
        result = await pickAndUploadPhoto(onProgress);
      } else {
        result = await pickAndUploadDocument(onProgress);
      }

      // undefined means user cancelled the picker — stay silent
      // real upload errors now throw (from uploadUri) and are caught below
      if (!result) return;

      const isImage = result.contentType.startsWith("image/");

      // Store the environment-agnostic objectPath ("/objects/uploads/<uuid>") in
      // the DB, NOT a full URL. resolveAttachmentUrl() reconstructs the correct
      // base URL at render time, so the attachment works on every device and after
      // redeployments. Full URLs built with localhost or the current domain would
      // break whenever the environment changes.
      const sendRes = await chatApi.send(id, {
        text: "",
        messageType: isImage ? "image" : "document",
        attachmentUrl: result.objectPath, // e.g. "/objects/uploads/<uuid>"
        attachmentType: result.contentType,
        attachmentName: result.fileName,
        attachmentSize: result.size,
      });

      // Use the API response directly instead of a full GET /messages refetch.
      // A refetch can return HTTP 304 (Not Modified) when the ETag hasn't changed
      // yet, giving back stale data that lacks the new message. The send response
      // always contains the canonical message row with the server-assigned ID.
      const newMsg = mapApiMessage({ ...(sendRes as any).data, isMe: true });
      setApiMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        const updated = [...prev, newMsg];
        lastMessageAtRef.current = newMsg.createdAt ?? lastMessageAtRef.current;
        return updated;
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = err?.message?.startsWith("FILE_TOO_LARGE")
        ? `${t("fileTooLarge")} (max ${formatBytes(MAX_ATTACHMENT_SIZE)})`
        : t("uploadError");
      Alert.alert(t("error"), msg);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const openAttachmentPicker = () => {
    if (isBlocked || uploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEmojiPicker(false);
    setShowAttachSheet(true);
  };

  // ─── Edit message handler ─────────────────────────────────────────────────
  const handleEditMessage = async () => {
    if (!editingMessageId || !editingText.trim()) return;
    try {
      const res = (await chatApi.editMessage(
        editingMessageId,
        editingText.trim(),
      )) as any;
      const updated = mapApiMessage({ ...res.data, isMe: true });
      setApiMessages((prev) =>
        prev.map((m) => (m.id === editingMessageId ? updated : m)),
      );
      setEditingMessageId(null);
      setEditingText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = err?.message?.includes("Délai") ? err.message : t("error");
      Alert.alert(t("error"), msg);
    }
  };

  // ─── Delete message handler ───────────────────────────────────────────────
  const handleDeleteMessage = (
    msgId: string,
    mode: "for_me" | "for_everyone",
  ) => {
    chatApi
      .deleteMessage(msgId, mode)
      .then(() => {
        if (mode === "for_me") {
          setApiMessages((prev) => prev.filter((m) => m.id !== msgId));
        } else {
          setApiMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    text: "",
                    isDeletedForEveryone: true,
                    attachmentUrl: null,
                    attachmentName: null,
                    attachmentType: null,
                  }
                : m,
            ),
          );
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      })
      .catch((err: any) => {
        const apiMsg = err?.message ?? "";
        const userMsg = apiMsg.includes("Délai") ? apiMsg : t("error");
        Alert.alert(t("error"), userMsg);
      });
  };

  // ─── Long-press message options ───────────────────────────────────────────
  const handleLongPress = (msg: ChatMessage) => {
    if (msg.id.startsWith("m")) return; // optimistic message — no ID yet
    if (msg.isDeletedForEveryone) return; // tombstone — nothing to do
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const reactions = msg.reactions ?? [];
    const ageMs = msg.createdAt
      ? Date.now() - new Date(msg.createdAt).getTime()
      : Infinity;
    const canEdit =
      msg.isMe &&
      msg.messageType === "text" &&
      !msg.attachmentUrl &&
      ageMs < 15 * 60 * 1000;
    const canDeleteForAll = msg.isMe && ageMs < 60 * 60 * 1000;

    const reactionOptions: any[] = REACTION_EMOJIS.map((emoji) => ({
      text: emoji,
      onPress: () => {
        const mine = reactions.find((r) => r.emoji === emoji)?.mine ?? false;
        handleToggleReaction(msg.id, emoji, mine);
      },
    }));

    const actionOptions: any[] = [...reactionOptions];

    if (canEdit) {
      actionOptions.push({
        text: t("editMessage"),
        onPress: () => {
          setEditingMessageId(msg.id);
          setEditingText(msg.text);
        },
      });
    }

    actionOptions.push({
      text: t("deleteForMe"),
      onPress: () => handleDeleteMessage(msg.id, "for_me"),
    });

    if (canDeleteForAll) {
      actionOptions.push({
        text: t("deleteForEveryone"),
        style: "destructive" as const,
        onPress: () =>
          Alert.alert(
            t("deleteForEveryone"),
            t("deleteForEveryoneConfirm"),
            [
              { text: t("cancel"), style: "cancel" },
              {
                text: t("delete"),
                style: "destructive",
                onPress: () => handleDeleteMessage(msg.id, "for_everyone"),
              },
            ],
          ),
      });
    }

    actionOptions.push({ text: t("cancel"), style: "cancel" as const });
    Alert.alert(t("messageOptions"), undefined, actionOptions);
  };

  if (!conversation) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground, padding: 20 }}>
          {t("conversationNotFound")}
        </Text>
      </View>
    );
  }

  const isGroup =
    conversation.isGroup ||
    conversation.convType === "group" ||
    conversation.role === "Groupe";

  // ─── Bubble corner helper (RTL-aware) ─────────────────────────────────────
  // In LTR: "my" bubbles have bottom-right cut (isMe=true → borderBottomRightRadius:4).
  //         "their" bubbles have bottom-left cut (isMe=false → borderBottomLeftRadius:4).
  // In RTL: flip the corners.
  function bubbleCornerStyle(isMe: boolean) {
    if (isRTL) {
      return isMe
        ? { borderBottomLeftRadius: 4 }
        : { borderBottomRightRadius: 4 };
    }
    return isMe
      ? { borderBottomRightRadius: 4 }
      : { borderBottomLeftRadius: 4 };
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View
          style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}
        >
          {isGroup ? (
            <Feather name="users" size={18} color={colors.primary} />
          ) : (
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {conversation.participant.split(" ")[0].slice(0, 2).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.headerName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {conversation.participant}
          </Text>
          <View style={styles.onlineRow}>
            <View
              style={[styles.onlineDot, { backgroundColor: colors.success }]}
            />
            <Text
              style={[styles.onlineLabel, { color: colors.mutedForeground }]}
            >
              {conversation.role}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.headerBtn, { backgroundColor: colors.secondary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Alert.alert(
              t("vocalCallLabel"),
              `${t("callLabel")} ${conversation.participant}?`,
              [
                { text: t("cancel"), style: "cancel" },
                {
                  text: t("callLabel"),
                  onPress: () =>
                    Linking.openURL("tel:").catch(() =>
                      Alert.alert(t("error"), t("callUnavailable")),
                    ),
                },
              ],
            );
          }}
        >
          <Feather name="phone" size={16} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerBtn, { backgroundColor: colors.secondary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const options: any[] = [
              { text: t("cancel"), style: "cancel" },
              {
                text: t("shareConversation"),
                onPress: () =>
                  shareContent(
                    `Conversation avec ${conversation.participant} sur MIZAN`,
                  ),
              },
            ];
            if (!isGroup && conversation.participantId) {
              options.push({
                text: isBlocked ? t("unblockUser") : t("blockUser"),
                onPress: handleToggleBlock,
              });
              options.push({
                text: t("reportUser"),
                onPress: () => setReportModalVisible(true),
              });
            } else {
              options.push({
                text: t("reportConversation"),
                onPress: () => setReportModalVisible(true),
              });
            }
            options.push({
              text: t("deleteConversation"),
              style: "destructive",
              onPress: () => {
                deleteConversation(id);
                router.back();
              },
            });
            Alert.alert(t("optionsLabel"), undefined, options);
          }}
        >
          <Feather name="more-vertical" size={16} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Upload progress bar */}
      {uploading && (
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: `${Math.round(uploadProgress * 100)}%` as any,
              },
            ]}
          />
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={threadMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={
          threadMessages.length === 0
            ? styles.listEmptyContainer
            : { padding: 16, gap: 8, paddingBottom: 12 }
        }
        showsVerticalScrollIndicator={false}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <EmptyState icon="message-circle" title={t("startConversation")} />
        }
        renderItem={({ item: msg, index }) => {
          const prev = threadMessages[index - 1];
          const showSender = !msg.isMe && (!prev || prev.sender !== msg.sender);
          const reactions: { emoji: string; count: number; mine: boolean }[] =
            msg.reactions ?? [];
          const isImage =
            msg.messageType === "image" ||
            msg.attachmentType?.startsWith("image/");
          const isDoc =
            msg.messageType === "document" || (!isImage && !!msg.attachmentUrl);
          const resolvedUrl = resolveAttachmentUrl(msg.attachmentUrl, token);

          return (
            <View style={[styles.msgRow, msg.isMe && styles.msgRowMe]}>
              {!msg.isMe && isGroup && (
                <View
                  style={[
                    styles.msgAvatar,
                    { backgroundColor: colors.primary + "20" },
                  ]}
                >
                  <Text
                    style={[styles.msgAvatarText, { color: colors.primary }]}
                  >
                    {msg.sender.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.msgGroup,
                  msg.isMe && { alignItems: "flex-end" },
                ]}
              >
                {showSender && (
                  <Text style={[styles.msgSender, { color: colors.primary }]}>
                    {msg.sender}
                  </Text>
                )}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onLongPress={() => handleLongPress(msg)}
                >
                  <View
                    style={[
                      styles.bubble,
                      bubbleCornerStyle(msg.isMe),
                      msg.isMe
                        ? { backgroundColor: colors.primary }
                        : {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            borderWidth: 1,
                          },
                      // Image bubbles have no padding — the image fills to the edge
                      isImage && resolvedUrl && !msg.isDeletedForEveryone
                        ? { padding: 0, overflow: "hidden" }
                        : {},
                    ]}
                  >
                    {msg.isDeletedForEveryone ? (
                      /* ── Tombstone for "deleted for everyone" ── */
                      <View style={styles.tombstoneBubble}>
                        <Feather
                          name="slash"
                          size={13}
                          color={
                            msg.isMe
                              ? "rgba(255,255,255,0.5)"
                              : colors.mutedForeground
                          }
                        />
                        <Text
                          style={[
                            styles.tombstoneText,
                            {
                              color: msg.isMe
                                ? "rgba(255,255,255,0.5)"
                                : colors.mutedForeground,
                            },
                          ]}
                        >
                          {t("messageDeleted")}
                        </Text>
                      </View>
                    ) : isImage && resolvedUrl ? (
                      /* ── Image attachment ── */
                      <TouchableOpacity
                        onPress={() => setImageViewerUrl(resolvedUrl)}
                      >
                        <Image
                          source={{ uri: resolvedUrl }}
                          style={styles.attachmentImage}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : isDoc && resolvedUrl ? (
                      /* ── Document attachment ── */
                      <TouchableOpacity
                        style={styles.docAttachment}
                        onPress={() =>
                          Linking.openURL(resolvedUrl).catch(() =>
                            Alert.alert(t("error"), t("cannotOpenFile")),
                          )
                        }
                      >
                        <View
                          style={[
                            styles.docIcon,
                            {
                              backgroundColor: msg.isMe
                                ? "rgba(255,255,255,0.2)"
                                : colors.primary + "20",
                            },
                          ]}
                        >
                          <Feather
                            name="file"
                            size={20}
                            color={msg.isMe ? "#fff" : colors.primary}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.docName,
                              { color: msg.isMe ? "#fff" : colors.foreground },
                            ]}
                            numberOfLines={2}
                          >
                            {msg.attachmentName ?? t("documentLabel")}
                          </Text>
                          <Text
                            style={[
                              styles.docOpen,
                              {
                                color: msg.isMe
                                  ? "rgba(255,255,255,0.7)"
                                  : colors.primary,
                              },
                            ]}
                          >
                            {t("openLabel")}
                          </Text>
                        </View>
                        <Feather
                          name="external-link"
                          size={14}
                          color={
                            msg.isMe
                              ? "rgba(255,255,255,0.7)"
                              : colors.mutedForeground
                          }
                        />
                      </TouchableOpacity>
                    ) : (
                      /* ── Plain text ── */
                      <Text
                        style={[
                          styles.bubbleText,
                          { color: msg.isMe ? "#fff" : colors.foreground },
                        ]}
                      >
                        {msg.text}
                      </Text>
                    )}
                    {/* Caption for image messages that also have text */}
                    {isImage && !msg.isDeletedForEveryone && msg.text ? (
                      <Text
                        style={[
                          styles.bubbleCaption,
                          { color: msg.isMe ? "#fff" : colors.foreground },
                        ]}
                      >
                        {msg.text}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {reactions.length > 0 && (
                  <View style={styles.reactionsRow}>
                    {reactions.map((r) => (
                      <TouchableOpacity
                        key={r.emoji}
                        style={[
                          styles.reactionChip,
                          {
                            backgroundColor: r.mine
                              ? colors.primary + "20"
                              : colors.secondary,
                            borderColor: r.mine
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                        onPress={() =>
                          handleToggleReaction(msg.id, r.emoji, r.mine)
                        }
                      >
                        <Text style={styles.reactionChipText}>
                          {r.emoji} {r.count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {/* Footer: time + "Modifié" + status tick */}
                <View
                  style={[
                    styles.msgFooter,
                    msg.isMe && { alignSelf: "flex-end" },
                  ]}
                >
                  {msg.editedAt && !msg.isDeletedForEveryone && (
                    <Text
                      style={[
                        styles.editedLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {t("edited")}
                    </Text>
                  )}
                  <Text
                    style={[styles.msgTime, { color: colors.mutedForeground }]}
                  >
                    {msg.time}
                  </Text>
                  {msg.isMe && !msg.id.startsWith("m") && (
                    <Feather
                      name="check"
                      size={11}
                      color={colors.mutedForeground}
                      style={styles.statusTick}
                    />
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Edit indicator bar */}
      {editingMessageId && (
        <View
          style={[
            styles.editIndicator,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <Feather name="edit-2" size={14} color={colors.primary} />
          <Text
            style={[styles.editIndicatorText, { color: colors.primary }]}
            numberOfLines={1}
          >
            {t("editingMessage")}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setEditingMessageId(null);
              setEditingText("");
            }}
          >
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}

      {isBlocked ? (
        <View
          style={[
            styles.blockedNotice,
            {
              backgroundColor: colors.secondary,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Feather name="slash" size={14} color={colors.mutedForeground} />
          <Text
            style={[
              styles.blockedNoticeText,
              { color: colors.mutedForeground },
            ]}
          >
            {t("conversationBlockedNotice")}
          </Text>
        </View>
      ) : (
        <>
          {typingUsers.length > 0 && (
            <View style={styles.typingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text
                style={[styles.typingText, { color: colors.mutedForeground }]}
              >
                {conversation.participant} {t("isTyping")}
              </Text>
            </View>
          )}
        </>
      )}

      {/* Attachment picker sheet */}
      {showAttachSheet && !isBlocked && (
        <View
          style={[
            styles.attachSheet,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <Text
            style={[styles.attachSheetTitle, { color: colors.mutedForeground }]}
          >
            {t("chooseFileType")}
          </Text>
          <View style={styles.attachSheetRow}>
            <TouchableOpacity
              style={[
                styles.attachOption,
                { backgroundColor: colors.secondary },
              ]}
              onPress={() => {
                setShowAttachSheet(false);
                handleAttach("camera");
              }}
            >
              <Feather name="camera" size={24} color={colors.primary} />
              <Text
                style={[styles.attachOptionLabel, { color: colors.foreground }]}
              >
                {t("cameraLabel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.attachOption,
                { backgroundColor: colors.secondary },
              ]}
              onPress={() => {
                setShowAttachSheet(false);
                handleAttach("gallery");
              }}
            >
              <Feather name="image" size={24} color={colors.primary} />
              <Text
                style={[styles.attachOptionLabel, { color: colors.foreground }]}
              >
                {t("photoLabel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.attachOption,
                { backgroundColor: colors.secondary },
              ]}
              onPress={() => {
                setShowAttachSheet(false);
                handleAttach("document");
              }}
            >
              <Feather name="file-text" size={24} color={colors.primary} />
              <Text
                style={[styles.attachOptionLabel, { color: colors.foreground }]}
              >
                {t("documentLabel")}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.attachCancelBtn, { borderTopColor: colors.border }]}
            onPress={() => setShowAttachSheet(false)}
          >
            <Text
              style={[
                styles.attachCancelText,
                { color: colors.mutedForeground },
              ]}
            >
              {t("cancel")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Emoji picker panel */}
      {showEmojiPicker && !isBlocked && (
        <View
          style={[
            styles.emojiPanel,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <ScrollView horizontal={false} style={{ maxHeight: 160 }}>
            <View style={styles.emojiGrid}>
              {EMOJI_GRID.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiBtn}
                  onPress={() => {
                    setText((prev) => prev + emoji);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={styles.emojiChar}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Full-screen image viewer */}
      <Modal
        visible={!!imageViewerUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewerUrl(null)}
        statusBarTranslucent
      >
        <View style={styles.imgViewerOverlay}>
          <TouchableOpacity
            style={styles.imgViewerClose}
            onPress={() => setImageViewerUrl(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={styles.imgViewerCloseBtn}>
              <Feather name="x" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
          {imageViewerUrl ? (
            <Image
              source={{ uri: imageViewerUrl }}
              style={styles.imgViewerImage}
              resizeMode="contain"
            />
          ) : null}
          <TouchableOpacity
            style={styles.imgViewerDownloadBtn}
            onPress={() => Linking.openURL(imageViewerUrl!).catch(() => {})}
          >
            <Feather name="download" size={18} color="#fff" />
            <Text style={styles.imgViewerDownloadText}>{t("downloadLabel")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Report modal */}
      {reportModalVisible && (
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity
            style={styles.reportOverlay}
            activeOpacity={1}
            onPress={() => setReportModalVisible(false)}
          />
          <View
            style={[
              styles.reportModal,
              { backgroundColor: colors.card, bottom: insets.bottom + 20 },
            ]}
          >
            <Text
              style={[styles.reportModalTitle, { color: colors.foreground }]}
            >
              {isGroup ? t("reportConversation") : t("reportUser")}
            </Text>
            <TextInput
              style={[
                styles.reportInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={reportReason}
              onChangeText={setReportReason}
              placeholder={t("reportReasonPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.reportSubmitBtn,
                {
                  backgroundColor: reportReason.trim()
                    ? colors.primary
                    : colors.muted,
                },
              ]}
              onPress={handleSubmitReport}
              disabled={!reportReason.trim()}
            >
              <Text style={styles.reportSubmitBtnText}>{t("send")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Input bar — normal mode OR edit mode */}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.card,
            borderTopColor: editingMessageId
              ? colors.primary + "40"
              : colors.border,
            borderTopWidth: editingMessageId ? 2 : 1,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        {editingMessageId ? (
          /* ── Edit mode ─────────────────────────────── */
          <>
            <TouchableOpacity
              style={[
                styles.inputIconBtn,
                { backgroundColor: colors.secondary },
              ]}
              onPress={() => {
                setEditingMessageId(null);
                setEditingText("");
              }}
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TextInput
              style={[
                styles.msgInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.primary + "60",
                  color: colors.foreground,
                },
              ]}
              value={editingText}
              onChangeText={setEditingText}
              placeholder={
                t("editMessagePlaceholder")
              }
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={10000}
              autoFocus
              onFocus={() => {
                setShowEmojiPicker(false);
                setShowAttachSheet(false);
              }}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                {
                  backgroundColor: editingText.trim()
                    ? "#10b981"
                    : colors.muted,
                },
              ]}
              onPress={handleEditMessage}
              disabled={!editingText.trim()}
            >
              <Feather
                name="check"
                size={18}
                color={editingText.trim() ? "#fff" : colors.mutedForeground}
              />
            </TouchableOpacity>
          </>
        ) : (
          /* ── Normal mode ───────────────────────────── */
          <>
            {/* Attach button */}
            <TouchableOpacity
              style={[
                styles.inputIconBtn,
                {
                  backgroundColor: showAttachSheet
                    ? colors.primary + "20"
                    : colors.secondary,
                },
              ]}
              disabled={uploading || isBlocked}
              onPress={() => {
                if (showAttachSheet) {
                  setShowAttachSheet(false);
                  return;
                }
                openAttachmentPicker();
              }}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather
                  name="paperclip"
                  size={18}
                  color={
                    showAttachSheet ? colors.primary : colors.mutedForeground
                  }
                />
              )}
            </TouchableOpacity>

            {/* Emoji toggle */}
            <TouchableOpacity
              style={[
                styles.inputIconBtn,
                {
                  backgroundColor: showEmojiPicker
                    ? colors.primary + "20"
                    : colors.secondary,
                },
              ]}
              disabled={isBlocked}
              onPress={() => {
                Haptics.selectionAsync();
                setShowAttachSheet(false);
                setShowEmojiPicker((v) => !v);
              }}
            >
              <Text style={styles.emojiToggle}>😊</Text>
            </TouchableOpacity>

            <TextInput
              style={[
                styles.msgInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={text}
              onChangeText={handleTextChange}
              placeholder={t("writeMessagePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={500}
              editable={!isBlocked}
              onSubmitEditing={handleSend}
              onFocus={() => setShowEmojiPicker(false)}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    text.trim() && !isBlocked ? colors.primary : colors.muted,
                },
              ]}
              onPress={handleSend}
              disabled={!text.trim() || isBlocked}
            >
              <Feather
                name="send"
                size={18}
                color={
                  text.trim() && !isBlocked ? "#fff" : colors.mutedForeground
                }
              />
            </TouchableOpacity>
          </>
        )}
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
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBar: {
    height: 3,
    width: "100%",
  },
  progressFill: {
    height: 3,
  },
  listEmptyContainer: { flexGrow: 1 },
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
  msgSender: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginStart: 4 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    // Corner is set dynamically via bubbleCornerStyle()
  },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 19 },
  bubbleCaption: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    padding: 8,
    paddingTop: 4,
  },
  // Inline image in bubble
  attachmentImage: {
    width: 220,
    height: 160,
    borderRadius: 14,
  },
  // Document attachment row
  docAttachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    maxWidth: 240,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  docName: { fontSize: 13, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  docOpen: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginStart: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 6,
    borderTopWidth: 1,
  },
  inputIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiToggle: { fontSize: 20 },
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
  reactionsRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
    flexWrap: "wrap",
  },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  reactionChipText: { fontSize: 12 },
  blockedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  blockedNoticeText: { fontSize: 12, flex: 1, fontFamily: "Inter_400Regular" },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  // Emoji picker
  emojiPanel: {
    borderTopWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  emojiBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  emojiChar: { fontSize: 22 },
  // Report modal
  reportOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  reportModal: {
    position: "absolute",
    start: 16,
    end: 16,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  reportModalTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  reportInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: "top",
    fontFamily: "Inter_400Regular",
  },
  reportSubmitBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  reportSubmitBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  // Full-screen image viewer
  imgViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.93)",
    alignItems: "center",
    justifyContent: "center",
  },
  imgViewerImage: {
    width: "100%",
    height: "80%",
  },
  imgViewerClose: {
    position: "absolute",
    top: 52,
    right: 20,
    zIndex: 10,
  },
  imgViewerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  imgViewerDownloadBtn: {
    position: "absolute",
    bottom: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  imgViewerDownloadText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  // Message footer (time + "Modifié" + tick)
  msgFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  editedLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  statusTick: {
    marginLeft: 1,
  },
  // Tombstone for deleted-for-everyone messages
  tombstoneBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    opacity: 0.75,
  },
  tombstoneText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  // Edit mode UI
  editIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 1,
  },
  editIndicatorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  // Attachment sheet
  attachSheet: {
    borderTopWidth: 1,
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  attachSheetTitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 14,
  },
  attachSheetRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 10,
    marginBottom: 10,
  },
  attachOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 14,
    gap: 8,
  },
  attachOptionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  attachCancelBtn: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 4,
    alignItems: "center",
  },
  attachCancelText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});

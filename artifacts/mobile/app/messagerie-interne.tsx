import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { announcements as announcementsApi, type ApiAnnouncement } from "@/services/api";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import EmptyState from "@/components/EmptyState";

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageType = "circulaire" | "convocation" | "decision" | "rapport" | "note" | "mise_en_demeure";
type TabType = "inbox" | "sent";

interface InternalMessage {
  id: string;
  type: MessageType;
  subject: string;
  body: string;
  from: string;
  fromRole: string;
  to: string;
  date: string;
  priority: "urgent" | "normal" | "low";
  attachments: number;
  requiresAcknowledgment: boolean;
  acknowledged?: boolean;
  isOwn?: boolean;
}

const TYPE_CONFIG: Record<MessageType, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  circulaire:      { label: "Circulaire",        icon: "mail",         color: "#3b82f6" },
  convocation:     { label: "Convocation",        icon: "calendar",     color: "#8b5cf6" },
  decision:        { label: "Décision",           icon: "check-square", color: "#10b981" },
  rapport:         { label: "Rapport",            icon: "file-text",    color: "#f59e0b" },
  note:            { label: "Note de service",    icon: "edit-3",       color: "#6b7280" },
  mise_en_demeure: { label: "Mise en demeure",    icon: "alert-circle", color: "#ef4444" },
};

// Map announcement priority → our priority
function mapPriority(p: string | undefined): "urgent" | "normal" | "low" {
  if (p === "urgent") return "urgent";
  if (p === "important") return "normal";
  return "low";
}

// Try to detect the message type from the title/body
function detectType(title: string): MessageType {
  const t = title.toLowerCase();
  if (t.includes("convoc")) return "convocation";
  if (t.includes("décision") || t.includes("decision")) return "decision";
  if (t.includes("rapport")) return "rapport";
  if (t.includes("note")) return "note";
  if (t.includes("demeure") || t.includes("mise en")) return "mise_en_demeure";
  return "circulaire";
}

function mapApiAnnouncement(a: ApiAnnouncement, currentUserId?: string): InternalMessage {
  return {
    id: a.id,
    type: detectType(a.title),
    subject: a.title,
    body: a.body,
    from: a.author ?? "Direction",
    fromRole: a.authorId === currentUserId ? "Moi" : "Administration",
    to: a.audience ?? "Tous les membres",
    date: a.createdAt ? a.createdAt.slice(0, 10) : "",
    priority: mapPriority(a.priority),
    attachments: 0,
    requiresAcknowledgment: a.priority === "urgent",
    acknowledged: false,
    isOwn: a.authorId === currentUserId,
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MessagerieInterneScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [tab, setTab] = useState<TabType>("inbox");
  const [allMessages, setAllMessages] = useState<InternalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<InternalMessage | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  // Compose form state
  const [newType, setNewType] = useState<MessageType>("note");
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newPriority, setNewPriority] = useState<"urgent" | "normal" | "low">("normal");
  const [sending, setSending] = useState(false);

  // ─── Load announcements ──────────────────────────────────────────────────

  const loadMessages = async () => {
    try {
      const res = await announcementsApi.list() as any;
      const rows: ApiAnnouncement[] = Array.isArray(res?.data) ? res.data : [];
      setAllMessages(rows.map((a) => mapApiAnnouncement(a, (user as any)?.id ?? (user as any)?.userId)));
    } catch {
      // silently keep existing data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
    setRefreshing(false);
  };

  // ─── Derived ─────────────────────────────────────────────────────────────

  const currentUserId = (user as any)?.id ?? (user as any)?.userId;
  const inbox = allMessages.filter((m) => !m.isOwn);
  const sent = allMessages.filter((m) => m.isOwn);
  const unreadCount = 0; // announcements don't track per-user read status in this implementation

  const currentList = tab === "inbox" ? inbox : sent;
  const filtered = searchQuery
    ? currentList.filter(
        (m) =>
          m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.from.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : currentList;

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleOpen = (msg: InternalMessage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(msg);
  };

  const handleAcknowledge = (id: string) => {
    setAcknowledgedIds((prev) => new Set([...prev, id]));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast({ type: "success", title: t('ackSuccessTitle'), message: t('ackSuccessMsg') });
  };

  const handleSend = async () => {
    if (!newSubject.trim() || !newBody.trim()) {
      showToast({ type: "warning", title: t('requiredFields'), message: t('fillSubjectBody') });
      return;
    }
    setSending(true);
    try {
      const priorityMap: Record<"urgent" | "normal" | "low", ApiAnnouncement["priority"]> = {
        urgent: "urgent",
        normal: "important",
        low: "info",
      };
      const fullSubject = `[${TYPE_CONFIG[newType].label}] ${newSubject}`;
      await announcementsApi.create({
        title: fullSubject,
        body: newBody,
        priority: priorityMap[newPriority],
        audience: "all",
      });
      setShowCompose(false);
      setNewSubject("");
      setNewBody("");
      setNewType("note");
      setNewPriority("normal");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t('messageSentTitle'), message: t('messageSentText') });
      await loadMessages();
    } catch {
      showToast({ type: "error", title: t('error'), message: t('sendErrorMsg') });
    } finally {
      setSending(false);
    }
  };

  const priorityColor = (p: string) =>
    p === "urgent" ? "#ef4444" : p === "normal" ? "#3b82f6" : "#10b981";
  const priorityLabel = (p: string) =>
    p === "urgent" ? "Urgent" : p === "normal" ? "Normal" : "Faible";

  // ─── Render ──────────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: InternalMessage }) => {
    const tc = TYPE_CONFIG[item.type];
    const acked = acknowledgedIds.has(item.id) || item.acknowledged;
    return (
      <TouchableOpacity
        style={[styles.msgCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => handleOpen(item)}
        activeOpacity={0.75}
      >
        <View style={[styles.msgTypeIcon, { backgroundColor: tc.color + "18" }]}>
          <Feather name={tc.icon} size={18} color={tc.color} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.msgTopRow}>
            <Text style={[styles.msgFrom, { color: colors.foreground }]} numberOfLines={1}>
              {item.from}
            </Text>
            <Text style={[styles.msgDate, { color: colors.mutedForeground }]}>{item.date}</Text>
          </View>
          <Text style={[styles.msgSubject, { color: colors.foreground }]} numberOfLines={1}>
            {item.subject}
          </Text>
          <View style={styles.msgMeta}>
            <View style={[styles.typeBadge, { backgroundColor: tc.color + "18" }]}>
              <Text style={[styles.typeBadgeText, { color: tc.color }]}>{tc.label}</Text>
            </View>
            {item.priority === "urgent" && (
              <View style={[styles.urgentBadge, { backgroundColor: "#ef444418" }]}>
                <Feather name="zap" size={10} color="#ef4444" />
                <Text style={[styles.urgentText, { color: "#ef4444" }]}>Urgent</Text>
              </View>
            )}
            {item.requiresAcknowledgment && !acked && (
              <View style={[styles.ackBadge, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="check-circle" size={10} color="#f59e0b" />
                <Text style={[styles.ackText, { color: "#f59e0b" }]}>AR requis</Text>
              </View>
            )}
          </View>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Messagerie Interne</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Communications officielles du syndicat
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.composeBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            setShowCompose(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Feather name="edit-3" size={15} color="#fff" />
          <Text style={styles.composeBtnText}>Rédiger</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Rechercher un message..."
            placeholderTextColor={colors.mutedForeground}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          { key: "inbox" as const, label: "Boîte de réception", count: 0 },
          { key: "sent" as const, label: "Envoyés", count: 0 },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => {
                setTab(t.key);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.mutedForeground }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderMessage}
          contentContainerStyle={
            filtered.length === 0
              ? styles.listEmptyContainer
              : { padding: 12, gap: 8, paddingBottom: insets.bottom + 80 }
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
          ListEmptyComponent={
            <EmptyState
              icon="inbox"
              title={tab === "inbox" ? "Boîte vide" : "Aucun message envoyé"}
              description={
                tab === "inbox"
                  ? "Aucune communication officielle du syndicat pour le moment."
                  : "Les messages que vous rédigez apparaîtront ici."
              }
            />
          }
        />
      )}

      {/* ─── Detail modal ────────────────────────────────────────────────── */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected ? (() => {
          const tc = TYPE_CONFIG[selected.type];
          const acked = acknowledgedIds.has(selected.id) || selected.acknowledged;
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Feather name="arrow-left" size={22} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {tc.label}
                </Text>
                <View style={{ width: 32 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
                {/* Subject */}
                <Text style={[styles.detailSubject, { color: colors.foreground }]}>
                  {selected.subject}
                </Text>

                {/* Meta card */}
                <View style={[styles.detailMetaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { label: "De", value: `${selected.from} — ${selected.fromRole}` },
                    { label: "À", value: selected.to },
                    { label: "Date", value: selected.date },
                  ].map((row, i) => (
                    <View key={row.label}>
                      {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                      <View style={styles.metaRow}>
                        <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                        <Text style={[styles.metaValue, { color: colors.foreground }]} numberOfLines={2}>
                          {row.value}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Badges */}
                <View style={styles.badgesRow}>
                  <View style={[styles.typeBadge, { backgroundColor: tc.color + "18" }]}>
                    <Feather name={tc.icon} size={12} color={tc.color} />
                    <Text style={[styles.typeBadgeText, { color: tc.color }]}>{tc.label}</Text>
                  </View>
                  <View style={[styles.priorityBadge, { backgroundColor: priorityColor(selected.priority) + "18" }]}>
                    <Text style={[styles.priorityText, { color: priorityColor(selected.priority) }]}>
                      {priorityLabel(selected.priority)}
                    </Text>
                  </View>
                </View>

                {/* Body */}
                <View style={[styles.bodyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.bodyText, { color: colors.foreground }]}>{selected.body}</Text>
                </View>

                {/* AR status */}
                {selected.requiresAcknowledgment && (
                  <View
                    style={[
                      styles.arBox,
                      {
                        backgroundColor: acked ? "#10b98110" : "#f59e0b10",
                        borderColor: acked ? "#10b98130" : "#f59e0b30",
                      },
                    ]}
                  >
                    <Feather
                      name={acked ? "check-circle" : "alert-circle"}
                      size={16}
                      color={acked ? "#10b981" : "#f59e0b"}
                    />
                    <Text style={[styles.arText, { color: acked ? "#10b981" : "#f59e0b" }]}>
                      {acked
                        ? "Accusé de réception envoyé"
                        : "Ce message requiert un accusé de réception"}
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.detailActions}>
                  {selected.requiresAcknowledgment && !acked && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                      onPress={() => handleAcknowledge(selected.id)}
                      activeOpacity={0.85}
                    >
                      <Feather name="check-circle" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Accuser réception</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtnOutline, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => {
                      setSelected(null);
                      setTimeout(() => {
                        setShowCompose(true);
                        setNewSubject(`RE: ${selected.subject}`);
                      }, 200);
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="corner-up-left" size={16} color={colors.foreground} />
                    <Text style={[styles.actionBtnOutlineText, { color: colors.foreground }]}>Répondre</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          );
        })() : null}
      </Modal>

      {/* ─── Compose modal ───────────────────────────────────────────────── */}
      <Modal
        visible={showCompose}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCompose(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowCompose(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rédiger un message</Text>
            {sending ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <TouchableOpacity onPress={handleSend}>
                <Feather name="send" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            {/* Type selector */}
            <View>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Type de message *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(Object.entries(TYPE_CONFIG) as [MessageType, typeof TYPE_CONFIG[MessageType]][]).map(([key, cfg]) => {
                  const active = newType === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: active ? cfg.color : colors.card,
                          borderColor: active ? cfg.color : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setNewType(key);
                        Haptics.selectionAsync();
                      }}
                    >
                      <Feather name={cfg.icon} size={13} color={active ? "#fff" : cfg.color} />
                      <Text style={[styles.typeChipText, { color: active ? "#fff" : colors.foreground }]}>
                        {cfg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Priority */}
            <View>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Priorité</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([
                  { key: "urgent" as const, label: "Urgente", color: "#ef4444" },
                  { key: "normal" as const, label: "Normale", color: "#3b82f6" },
                  { key: "low" as const, label: "Faible", color: "#10b981" },
                ]).map((p) => {
                  const active = newPriority === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[
                        styles.priorityChip,
                        {
                          backgroundColor: active ? p.color + "20" : colors.card,
                          borderColor: active ? p.color : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setNewPriority(p.key);
                        Haptics.selectionAsync();
                      }}
                    >
                      <Text style={[styles.priorityChipText, { color: active ? p.color : colors.foreground }]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Subject */}
            <View>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Objet *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={newSubject}
                onChangeText={setNewSubject}
                placeholder="Objet du message"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Body */}
            <View>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Corps du message *</Text>
              <TextInput
                style={[styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={newBody}
                onChangeText={setNewBody}
                placeholder="Rédigez votre message ici..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: sending ? colors.muted : colors.primary }]}
              onPress={handleSend}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={styles.sendBtnText}>Envoyer le message</Text>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  composeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  composeBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  tabsRow: { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 8 },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  msgCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  msgTypeIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  msgTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  msgFrom: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  msgDate: { fontSize: 10, fontFamily: "Inter_400Regular" },
  msgSubject: { fontSize: 13, fontFamily: "Inter_500Medium" },
  msgMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  urgentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  urgentText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  ackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ackText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  // Fills the space below the tabs bar so EmptyState can center itself
  // there without the FlatList adding its own scrollable padding/gaps.
  listEmptyContainer: { flexGrow: 1 },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
  detailSubject: { fontSize: 17, fontFamily: "Inter_700Bold", lineHeight: 24 },
  detailMetaCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  metaRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  metaLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", width: 36 },
  metaValue: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  sep: { height: 1 },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  priorityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  priorityText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  bodyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  bodyText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  arBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  arText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  detailActions: { gap: 10 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  actionBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnOutlineText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  formLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  priorityChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  priorityChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 160,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  sendBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});

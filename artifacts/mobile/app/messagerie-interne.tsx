import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
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
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type MessageType = "circulaire" | "convocation" | "decision" | "rapport" | "note" | "mise_en_demeure";
type MessageStatus = "unread" | "read" | "archived" | "sent";
type TabType = "inbox" | "sent" | "archived";

interface InternalMessage {
  id: string;
  type: MessageType;
  subject: string;
  body: string;
  from: string;
  fromRole: string;
  to: string[];
  date: string;
  status: MessageStatus;
  priority: "urgent" | "normal" | "low";
  attachments: number;
  reference?: string;
  requiresAcknowledgment: boolean;
  acknowledged?: boolean;
}

const TYPE_CONFIG: Record<MessageType, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  circulaire: { label: "Circulaire", icon: "mail", color: "#3b82f6" },
  convocation: { label: "Convocation", icon: "calendar", color: "#8b5cf6" },
  decision: { label: "Décision", icon: "check-square", color: "#10b981" },
  rapport: { label: "Rapport", icon: "file-text", color: "#f59e0b" },
  note: { label: "Note de service", icon: "edit-3", color: "#6b7280" },
  mise_en_demeure: { label: "Mise en demeure", icon: "alert-circle", color: "#ef4444" },
};

const MOCK_INBOX: InternalMessage[] = [
  {
    id: "m1",
    type: "convocation",
    subject: "Convocation — Réunion bureau du 10 juin 2026",
    body: "Monsieur/Madame,\n\nVous êtes convoqué(e) à la réunion du bureau exécutif du syndicat qui se tiendra le mardi 10 juin 2026 à 14h00 au siège social.\n\nOrdre du jour :\n1. Approbation du PV de la réunion précédente\n2. Point sur les cotisations en retard\n3. Préparation des élections de juin\n4. Questions diverses\n\nVotre présence est obligatoire.",
    from: "Fatima Zahra El Alami",
    fromRole: "Secrétaire Générale",
    to: ["Tous les membres du bureau"],
    date: "2026-05-28",
    status: "unread",
    priority: "urgent",
    attachments: 1,
    reference: "REF-2026-CV-045",
    requiresAcknowledgment: true,
    acknowledged: false,
  },
  {
    id: "m2",
    type: "circulaire",
    subject: "Circulaire N°12/2026 — Mise à jour barème cotisations",
    body: "Chers membres,\n\nConformément aux décisions prises lors de l'AG du 15 mars 2026, le barème des cotisations syndicales est mis à jour à compter du 1er juillet 2026.\n\nLes nouveaux montants sont les suivants :\n• Tranche A (salaire < 5000 MAD) : 50 MAD/mois\n• Tranche B (5000-10000 MAD) : 80 MAD/mois\n• Tranche C (> 10000 MAD) : 120 MAD/mois\n\nCes montants restent déductibles fiscalement.",
    from: "Direction SNE",
    fromRole: "Super Administration",
    to: ["Tous les membres"],
    date: "2026-05-20",
    status: "read",
    priority: "normal",
    attachments: 2,
    reference: "CIR-2026-012",
    requiresAcknowledgment: false,
  },
  {
    id: "m3",
    type: "decision",
    subject: "Décision N°08/2026 — Attribution prime ancienneté",
    body: "En vertu des statuts du syndicat et suite à l'accord de négociation collective signé le 02 mai 2026, il est décidé d'attribuer une prime d'ancienneté aux membres ayant plus de 10 ans d'adhésion continue.\n\nMontant : 2 mois de cotisation offerts.\nBénéficiaires : voir liste annexée.\nDate d'effet : 1er juin 2026.",
    from: "Bureau Exécutif SNE",
    fromRole: "Bureau Exécutif",
    to: ["Membres concernés"],
    date: "2026-05-15",
    status: "read",
    priority: "normal",
    attachments: 1,
    reference: "DEC-2026-008",
    requiresAcknowledgment: true,
    acknowledged: true,
  },
  {
    id: "m4",
    type: "note",
    subject: "Note de service — Rappel procédures de vote électronique",
    body: "À l'attention de tous les membres,\n\nDans le cadre des prochaines élections du bureau (15 juin 2026), nous vous rappelons la procédure de vote électronique :\n\n1. Connectez-vous à l'application SYNDYCAT\n2. Accédez à l'onglet \"Élections\"\n3. Sélectionnez l'élection en cours\n4. Votez avant le 15 juin 23h59\n\nTout vote soumis après cette date sera déclaré nul.",
    from: "Commission Électorale",
    fromRole: "Commission Interne",
    to: ["Tous les membres actifs"],
    date: "2026-05-10",
    status: "archived",
    priority: "low",
    attachments: 0,
    reference: "NOTE-2026-031",
    requiresAcknowledgment: false,
  },
];

const MOCK_SENT: InternalMessage[] = [
  {
    id: "s1",
    type: "rapport",
    subject: "Rapport mensuel — Activités membres Mai 2026",
    body: "Rapport d'activité mensuel transmis à la direction pour approbation.",
    from: "Ahmed Membre",
    fromRole: "Membre Adhérent",
    to: ["Secrétariat Général"],
    date: "2026-05-31",
    status: "sent",
    priority: "normal",
    attachments: 3,
    reference: "RAP-2026-05",
    requiresAcknowledgment: false,
  },
];

export default function MessagerieInterneScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [tab, setTab] = useState<TabType>("inbox");
  const [messages, setMessages] = useState<InternalMessage[]>(MOCK_INBOX);
  const [sentMessages] = useState<InternalMessage[]>(MOCK_SENT);
  const [selected, setSelected] = useState<InternalMessage | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [newType, setNewType] = useState<MessageType>("note");
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newPriority, setNewPriority] = useState<"urgent" | "normal" | "low">("normal");

  const inbox = messages.filter((m) => m.status !== "archived");
  const archived = messages.filter((m) => m.status === "archived");
  const unreadCount = inbox.filter((m) => m.status === "unread").length;

  const currentList = tab === "inbox" ? inbox : tab === "sent" ? sentMessages : archived;
  const filtered = searchQuery
    ? currentList.filter((m) => m.subject.toLowerCase().includes(searchQuery.toLowerCase()) || m.from.toLowerCase().includes(searchQuery.toLowerCase()))
    : currentList;

  const handleOpen = (msg: InternalMessage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, status: m.status === "unread" ? "read" : m.status } : m));
    setSelected(msg);
  };

  const handleAcknowledge = (id: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, acknowledged: true } : m));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Accusé de réception", "Votre accusé de réception a été envoyé au service expéditeur.");
  };

  const handleArchive = (id: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, status: "archived" } : m));
    setSelected(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSend = () => {
    if (!newSubject.trim() || !newBody.trim() || !newTo.trim()) {
      Alert.alert("Champs requis", "Veuillez remplir tous les champs obligatoires.");
      return;
    }
    setShowCompose(false);
    setNewSubject(""); setNewBody(""); setNewTo("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Message envoyé", "Votre message a été transmis avec succès.");
  };

  const priorityColor = (p: string) => p === "urgent" ? "#ef4444" : p === "normal" ? "#3b82f6" : "#10b981";
  const priorityLabel = (p: string) => p === "urgent" ? "Urgent" : p === "normal" ? "Normal" : "Faible";

  const renderMessage = ({ item }: { item: InternalMessage }) => {
    const tc = TYPE_CONFIG[item.type];
    const isUnread = item.status === "unread";
    return (
      <TouchableOpacity
        style={[
          styles.msgCard,
          { backgroundColor: isUnread ? colors.primary + "08" : colors.card, borderColor: isUnread ? colors.primary + "30" : colors.border },
        ]}
        onPress={() => handleOpen(item)}
        activeOpacity={0.75}
      >
        <View style={styles.msgLeft}>
          <View style={[styles.msgTypeIcon, { backgroundColor: tc.color + "18" }]}>
            <Feather name={tc.icon} size={18} color={tc.color} />
          </View>
          {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.msgTopRow}>
            <Text style={[styles.msgFrom, { color: colors.foreground }]} numberOfLines={1}>{item.from}</Text>
            <Text style={[styles.msgDate, { color: colors.mutedForeground }]}>{item.date}</Text>
          </View>
          <Text style={[styles.msgSubject, { color: colors.foreground, fontFamily: isUnread ? "Inter_700Bold" : "Inter_500Medium" }]} numberOfLines={1}>
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
            {item.requiresAcknowledgment && !item.acknowledged && (
              <View style={[styles.ackBadge, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="check-circle" size={10} color="#f59e0b" />
                <Text style={[styles.ackText, { color: "#f59e0b" }]}>AR requis</Text>
              </View>
            )}
            {item.attachments > 0 ? (
              <View style={styles.attachRow}>
                <Feather name="paperclip" size={11} color={colors.mutedForeground} />
                <Text style={[styles.attachText, { color: colors.mutedForeground }]}>{item.attachments}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Messagerie Interne</Text>
          {unreadCount > 0 ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{unreadCount} message{unreadCount > 1 ? "s" : ""} non lu{unreadCount > 1 ? "s" : ""}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.composeBtn, { backgroundColor: colors.primary }]}
          onPress={() => { setShowCompose(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name="edit-3" size={16} color="#fff" />
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
          { key: "inbox" as const, label: "Boîte de réception", count: unreadCount },
          { key: "sent" as const, label: "Envoyés", count: 0 },
          { key: "archived" as const, label: "Archivés", count: 0 },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, active ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : null]}
              onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{t.label}</Text>
              {t.count > 0 ? (
                <View style={[styles.tabBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.tabBadgeText}>{t.count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="inbox" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {tab === "inbox" ? "Boîte vide" : tab === "sent" ? "Aucun envoi" : "Aucun archivé"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {tab === "inbox" ? "Vous êtes à jour !" : "Les messages envoyés apparaîtront ici."}
            </Text>
          </View>
        }
      />

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="arrow-left" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>{TYPE_CONFIG[selected.type].label}</Text>
              <TouchableOpacity onPress={() => { handleArchive(selected.id); }}>
                <Feather name="archive" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              {/* Subject */}
              <Text style={[styles.detailSubject, { color: colors.foreground }]}>{selected.subject}</Text>

              {/* Meta */}
              <View style={[styles.detailMetaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "De", value: `${selected.from} — ${selected.fromRole}` },
                  { label: "À", value: selected.to.join(", ") },
                  { label: "Date", value: selected.date },
                  ...(selected.reference ? [{ label: "Référence", value: selected.reference }] : []),
                ].map((row, i, arr) => (
                  <View key={row.label}>
                    {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.metaRow}>
                      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[styles.metaValue, { color: colors.foreground }]} numberOfLines={2}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Badges */}
              <View style={styles.badgesRow}>
                {(() => {
                  const tc = TYPE_CONFIG[selected.type];
                  return (
                    <View style={[styles.typeBadge, { backgroundColor: tc.color + "18" }]}>
                      <Feather name={tc.icon} size={12} color={tc.color} />
                      <Text style={[styles.typeBadgeText, { color: tc.color }]}>{tc.label}</Text>
                    </View>
                  );
                })()}
                <View style={[styles.priorityBadge, { backgroundColor: priorityColor(selected.priority) + "18" }]}>
                  <Text style={[styles.priorityText, { color: priorityColor(selected.priority) }]}>{priorityLabel(selected.priority)}</Text>
                </View>
                {selected.attachments > 0 ? (
                  <View style={[styles.attachBadge2, { backgroundColor: colors.secondary }]}>
                    <Feather name="paperclip" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.attachText, { color: colors.mutedForeground }]}>{selected.attachments} pièce{selected.attachments > 1 ? "s" : ""} jointe{selected.attachments > 1 ? "s" : ""}</Text>
                  </View>
                ) : null}
              </View>

              {/* Body */}
              <View style={[styles.bodyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.bodyText, { color: colors.foreground }]}>{selected.body}</Text>
              </View>

              {/* AR required */}
              {selected.requiresAcknowledgment && (
                <View style={[
                  styles.arBox,
                  {
                    backgroundColor: selected.acknowledged ? "#10b98110" : "#f59e0b10",
                    borderColor: selected.acknowledged ? "#10b98130" : "#f59e0b30",
                  },
                ]}>
                  <Feather
                    name={selected.acknowledged ? "check-circle" : "alert-circle"}
                    size={16}
                    color={selected.acknowledged ? "#10b981" : "#f59e0b"}
                  />
                  <Text style={[styles.arText, { color: selected.acknowledged ? "#10b981" : "#f59e0b" }]}>
                    {selected.acknowledged
                      ? "Accusé de réception envoyé"
                      : "Ce message requiert un accusé de réception"}
                  </Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.detailActions}>
                {selected.requiresAcknowledgment && !selected.acknowledged ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleAcknowledge(selected.id)}
                    activeOpacity={0.85}
                  >
                    <Feather name="check-circle" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Accuser réception</Text>
                  </TouchableOpacity>
                ) : null}
                {selected.attachments > 0 ? (
                  <TouchableOpacity
                    style={[styles.actionBtnOutline, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Pièces jointes", `${selected.attachments} fichier(s) disponible(s). Téléchargement en cours...`); }}
                    activeOpacity={0.85}
                  >
                    <Feather name="download" size={16} color={colors.primary} />
                    <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>Pièces jointes</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.actionBtnOutline, { borderColor: colors.border, backgroundColor: colors.card }]}
                  onPress={() => {
                    setSelected(null);
                    setTimeout(() => { setShowCompose(true); setNewSubject(`RE: ${selected.subject}`); }, 200);
                  }}
                  activeOpacity={0.85}
                >
                  <Feather name="corner-up-left" size={16} color={colors.foreground} />
                  <Text style={[styles.actionBtnOutlineText, { color: colors.foreground }]}>Répondre</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Compose modal */}
      <Modal visible={showCompose} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCompose(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowCompose(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rédiger un message</Text>
            <TouchableOpacity onPress={handleSend}>
              <Feather name="send" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            {/* Type */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Type de message *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(Object.entries(TYPE_CONFIG) as [MessageType, typeof TYPE_CONFIG[MessageType]][]).map(([key, cfg]) => {
                  const active = newType === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.typeChip, { backgroundColor: active ? cfg.color : colors.card, borderColor: active ? cfg.color : colors.border }]}
                      onPress={() => { setNewType(key); Haptics.selectionAsync(); }}
                    >
                      <Feather name={cfg.icon} size={13} color={active ? "#fff" : cfg.color} />
                      <Text style={[styles.typeChipText, { color: active ? "#fff" : colors.foreground }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Priority */}
            <View style={styles.formGroup}>
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
                      style={[styles.priorityChip, { backgroundColor: active ? p.color + "20" : colors.card, borderColor: active ? p.color : colors.border }]}
                      onPress={() => { setNewPriority(p.key); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.priorityChipText, { color: active ? p.color : colors.foreground }]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* To */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Destinataires *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={newTo}
                onChangeText={setNewTo}
                placeholder="Tous les membres / Bureau exécutif / Nom..."
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Subject */}
            <View style={styles.formGroup}>
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
            <View style={styles.formGroup}>
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
              style={[styles.sendBtn, { backgroundColor: colors.primary }]}
              onPress={handleSend}
              activeOpacity={0.85}
            >
              <Feather name="send" size={16} color="#fff" />
              <Text style={styles.sendBtnText}>Envoyer le message</Text>
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

  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
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

  tabsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },

  msgCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  msgLeft: { position: "relative" },
  msgTypeIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  unreadDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#fff",
  },
  msgTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  msgFrom: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  msgDate: { fontSize: 10, fontFamily: "Inter_400Regular" },
  msgSubject: { fontSize: 13 },
  msgMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  urgentBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  urgentText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  ackBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  ackText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  attachRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  attachText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  empty: { paddingTop: 60, alignItems: "center", gap: 14 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 20 : 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  modalTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold" },

  detailSubject: { fontSize: 18, fontFamily: "Inter_700Bold", lineHeight: 26 },
  detailMetaCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  metaRow: { flexDirection: "row", padding: 12, gap: 12 },
  metaLabel: { fontSize: 12, fontFamily: "Inter_400Regular", width: 70 },
  metaValue: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  sep: { height: 1 },

  badgesRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  priorityText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  attachBadge2: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

  bodyCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  bodyText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 24 },

  arBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  arText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },

  detailActions: { gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  actionBtnOutline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  actionBtnOutlineText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  formGroup: { gap: 8 },
  formLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  typeChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  priorityChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  priorityChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 150 },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  sendBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});

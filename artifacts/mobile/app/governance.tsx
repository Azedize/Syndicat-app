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

type BureauMember = { id: string; name: string; role: string; icon: keyof typeof Feather.glyphMap; since: string; email: string; phone: string };
type Commission = { id: string; name: string; members: number; status: "active" | "inactive"; chair: string; nextMeeting: string };

const INITIAL_BUREAU: BureauMember[] = [
  { id: "1", name: "Fatima Zahra El Alami", role: "Secrétaire Générale", icon: "briefcase", since: "2023", email: "fz@sne.ma", phone: "+212 6 61 23 45 67" },
  { id: "2", name: "Mohamed Ouali", role: "Secrétaire Général Adjoint", icon: "users", since: "2023", email: "m.ouali@sne.ma", phone: "+212 6 62 34 56 78" },
  { id: "3", name: "Ahmed El Fassi", role: "Trésorier Général", icon: "dollar-sign", since: "2023", email: "a.fassi@sne.ma", phone: "+212 6 63 45 67 89" },
  { id: "4", name: "Nadia Benkiran", role: "Secrétaire aux Relations", icon: "link", since: "2023", email: "n.benkiran@sne.ma", phone: "+212 6 64 56 78 90" },
  { id: "5", name: "Omar Slimani", role: "Secrétaire à l'Organisation", icon: "grid", since: "2023", email: "o.slimani@sne.ma", phone: "+212 6 65 67 89 01" },
  { id: "6", name: "Zineb Mansour", role: "Secrétaire à la Formation", icon: "book-open", since: "2023", email: "z.mansour@sne.ma", phone: "+212 6 66 78 90 12" },
];

const INITIAL_COMMISSIONS: Commission[] = [
  { id: "1", name: "Commission Juridique", members: 5, status: "active", chair: "Rachid Amrani", nextMeeting: "2026-05-28" },
  { id: "2", name: "Commission Financière", members: 4, status: "active", chair: "Sanaa Benchekroun", nextMeeting: "2026-06-02" },
  { id: "3", name: "Commission Sociale", members: 6, status: "active", chair: "Laila Berrada", nextMeeting: "2026-06-10" },
  { id: "4", name: "Commission Femmes", members: 3, status: "active", chair: "Khadija Tahiri", nextMeeting: "2026-06-15" },
  { id: "5", name: "Commission Formation", members: 7, status: "active", chair: "Youssef Idrissi", nextMeeting: "2026-07-01" },
];

type TabType = "organigramme" | "commissions" | "mandats" | "delegations" | "documents";

interface Mandat {
  id: string;
  poste: string;
  holder: string;
  startDate: string;
  endDate: string;
  status: "actif" | "expire" | "vacant";
  bureau: string;
}

interface Delegation {
  id: string;
  delegant: string;
  delegataire: string;
  domaine: string;
  startDate: string;
  endDate: string;
  status: "active" | "expired" | "revoked";
  description: string;
}

const INITIAL_MANDATS: Mandat[] = [
  { id: "m1", poste: "Secrétaire Générale", holder: "Fatima Zahra El Alami", startDate: "2023-12-01", endDate: "2026-12-01", status: "actif", bureau: "Bureau National" },
  { id: "m2", poste: "Secrétaire Général Adjoint", holder: "Mohamed Ouali", startDate: "2023-12-01", endDate: "2026-12-01", status: "actif", bureau: "Bureau National" },
  { id: "m3", poste: "Trésorier Général", holder: "Ahmed El Fassi", startDate: "2023-12-01", endDate: "2026-12-01", status: "actif", bureau: "Bureau National" },
  { id: "m4", poste: "Secrétaire aux Relations", holder: "Nadia Benkiran", startDate: "2023-12-01", endDate: "2026-12-01", status: "actif", bureau: "Bureau National" },
  { id: "m5", poste: "Président Bureau Casablanca", holder: "Hassan Berrada", startDate: "2024-01-01", endDate: "2026-01-01", status: "expire", bureau: "Bureau Régional Casa" },
  { id: "m6", poste: "Délégué Syndical - Fès", holder: "", startDate: "", endDate: "", status: "vacant", bureau: "Bureau Régional Fès" },
];

const INITIAL_DELEGATIONS: Delegation[] = [
  { id: "d1", delegant: "Fatima Zahra El Alami", delegataire: "Mohamed Ouali", domaine: "Représentation institutionnelle", startDate: "2026-03-01", endDate: "2026-06-30", status: "active", description: "Délégation de pouvoir pour représenter le syndicat lors des négociations ministérielles du printemps 2026." },
  { id: "d2", delegant: "Ahmed El Fassi", delegataire: "Nadia Benkiran", domaine: "Gestion financière courante", startDate: "2026-04-15", endDate: "2026-05-15", status: "expired", description: "Autorisation de signature des dépenses courantes inférieures à 5 000 MAD pendant le congé du trésorier." },
  { id: "d3", delegant: "Mohamed Ouali", delegataire: "Omar Slimani", domaine: "Organisation des formations", startDate: "2026-05-01", endDate: "2026-12-31", status: "active", description: "Délégation pour la coordination et l'organisation des sessions de formation syndicale régionales." },
];

export default function GovernanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabType>("organigramme");
  const [bureau, setBureau] = useState(INITIAL_BUREAU);
  const [commissions, setCommissions] = useState(INITIAL_COMMISSIONS);
  const [mandats, setMandats] = useState(INITIAL_MANDATS);
  const [nomineeInput, setNomineeInput] = useState("");
  const [delegations, setDelegations] = useState(INITIAL_DELEGATIONS);
  const [selectedMember, setSelectedMember] = useState<BureauMember | null>(null);
  const [selectedCommission, setSelectedCommission] = useState<Commission | null>(null);
  const [selectedMandat, setSelectedMandat] = useState<Mandat | null>(null);
  const [selectedDelegation, setSelectedDelegation] = useState<Delegation | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddDelegation, setShowAddDelegation] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newDelegant, setNewDelegant] = useState("");
  const [newDelegataire, setNewDelegataire] = useState("");
  const [newDomaine, setNewDomaine] = useState("");
  const [newDelegDesc, setNewDelegDesc] = useState("");
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isAdmin = user?.role !== "member";

  const president = bureau[0]!;
  const vp = bureau[1]!;
  const restBureau = bureau.slice(2);

  const handleAddMember = () => {
    if (!newName.trim() || !newRole.trim()) return;
    const m: BureauMember = {
      id: Date.now().toString(),
      name: newName.trim(),
      role: newRole.trim(),
      icon: "user",
      since: "2026",
      email: "",
      phone: "",
    };
    setBureau((prev) => [...prev, m]);
    setShowAddMember(false);
    setNewName(""); setNewRole("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRemoveMember = (id: string, name: string) => {
    Alert.alert("Retirer du bureau", `Retirer ${name} du bureau national?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: () => {
          setBureau((prev) => prev.filter((m) => m.id !== id));
          setSelectedMember(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const handleAddDelegation = () => {
    if (!newDelegant.trim() || !newDelegataire.trim() || !newDomaine.trim()) return;
    const d: Delegation = {
      id: `d${Date.now()}`,
      delegant: newDelegant.trim(),
      delegataire: newDelegataire.trim(),
      domaine: newDomaine.trim(),
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: "active",
      description: newDelegDesc.trim(),
    };
    setDelegations((prev) => [d, ...prev]);
    setShowAddDelegation(false);
    setNewDelegant(""); setNewDelegataire(""); setNewDomaine(""); setNewDelegDesc("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRevokeDelegation = (id: string) => {
    Alert.alert("Révoquer la délégation", "Cette action annulera la délégation de pouvoir.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Révoquer",
        style: "destructive",
        onPress: () => {
          setDelegations((prev) => prev.map((d) => d.id === id ? { ...d, status: "revoked" as const } : d));
          setSelectedDelegation(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const TABS: { key: TabType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: "organigramme", label: "Bureau", icon: "users" },
    { key: "commissions", label: "Commissions", icon: "layers" },
    { key: "mandats", label: "Mandats", icon: "award" },
    { key: "delegations", label: "Délégations", icon: "share-2" },
    { key: "documents", label: "Statuts", icon: "file-text" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Gouvernance</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Bureau National — Mandat 2023-2026
          </Text>
        </View>
        {isAdmin && tab === "organigramme" ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowAddMember(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="user-plus" size={16} color="#fff" />
          </TouchableOpacity>
        ) : isAdmin && tab === "delegations" ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowAddDelegation(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="plus" size={16} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tabs — scrollable horizontally for 5 tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabsScroll, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 4 }}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : null]}
            onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
          >
            <Feather name={t.icon} size={14} color={tab === t.key ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabLabel, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === "organigramme" ? (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          {/* Mandate badge */}
          <View style={[styles.mandatBadge, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={[styles.mandatText, { color: colors.primary }]}>
              Mandat en cours: 2023–2026 • {bureau.length} membres du bureau
            </Text>
          </View>

          {/* President */}
          <View style={styles.levelCenter}>
            <TouchableOpacity
              style={[styles.presidentCard, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setSelectedMember(president)}
              activeOpacity={0.85}
            >
              <View style={styles.presAvatar}>
                <Text style={styles.presInitials}>
                  {president.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </Text>
              </View>
              <Text style={styles.presName} numberOfLines={1}>{president.name}</Text>
              <Text style={styles.presRole} numberOfLines={2}>{president.role}</Text>
              <View style={[styles.presSince, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <Feather name="calendar" size={10} color="rgba(255,255,255,0.8)" />
                <Text style={styles.presSinceText}>Depuis {president.since}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Connector */}
          <View style={[styles.connector, { backgroundColor: colors.border }]} />

          {/* VP */}
          <View style={styles.levelCenter}>
            <TouchableOpacity
              style={[styles.vpCard, { backgroundColor: colors.card, borderColor: colors.primary + "60" }]}
              onPress={() => setSelectedMember(vp)}
              activeOpacity={0.85}
            >
              <View style={[styles.vpAvatar, { backgroundColor: colors.primary + "15" }]}>
                <Text style={[styles.vpInitials, { color: colors.primary }]}>
                  {vp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </Text>
              </View>
              <Text style={[styles.vpName, { color: colors.foreground }]} numberOfLines={1}>{vp.name}</Text>
              <Text style={[styles.vpRole, { color: colors.mutedForeground }]} numberOfLines={2}>{vp.role}</Text>
            </TouchableOpacity>
          </View>

          {/* Connector */}
          <View style={[styles.connector, { backgroundColor: colors.border }]} />

          {/* Rest of bureau */}
          <Text style={[styles.bureauSectionLabel, { color: colors.mutedForeground }]}>MEMBRES DU BUREAU</Text>
          <View style={styles.bureauGrid}>
            {restBureau.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.bureauCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setSelectedMember(m)}
                activeOpacity={0.8}
              >
                <View style={[styles.bureauIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name={m.icon} size={16} color={colors.primary} />
                </View>
                <Text style={[styles.bureauName, { color: colors.foreground }]} numberOfLines={1}>{m.name.split(" ")[0]} {m.name.split(" ")[1]}</Text>
                <Text style={[styles.bureauRole, { color: colors.mutedForeground }]} numberOfLines={2}>{m.role}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : tab === "commissions" ? (
        <FlatList
          data={commissions}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={[styles.commHeader, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
              <Feather name="layers" size={14} color={colors.primary} />
              <Text style={[styles.commHeaderText, { color: colors.primary }]}>
                {commissions.filter((c) => c.status === "active").length} commissions actives
              </Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={[styles.commCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelectedCommission(c); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <View style={[styles.commIcon, { backgroundColor: colors.primary + "15" }]}>
                <Feather name="layers" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.commName2, { color: colors.foreground }]}>{c.name}</Text>
                <View style={styles.commMeta}>
                  <Feather name="users" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.commMetaText, { color: colors.mutedForeground }]}>{c.members} membres</Text>
                  <Text style={[styles.commMetaDot, { color: colors.mutedForeground }]}>•</Text>
                  <Text style={[styles.commMetaText, { color: colors.mutedForeground }]}>Prés: {c.chair.split(" ")[0]}</Text>
                </View>
                <View style={styles.commMeta}>
                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.commMetaText, { color: colors.mutedForeground }]}>Prochaine réunion: {c.nextMeeting}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <View style={[styles.commStatus, { backgroundColor: c.status === "active" ? colors.success + "15" : colors.muted }]}>
                  <View style={[styles.commStatusDot, { backgroundColor: c.status === "active" ? colors.success : colors.mutedForeground }]} />
                  <Text style={[styles.commStatusText, { color: c.status === "active" ? colors.success : colors.mutedForeground }]}>
                    {c.status === "active" ? "Active" : "Inactive"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>
          )}
        />
      ) : tab === "mandats" ? (
        <FlatList
          data={mandats}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.mandatsHeader}>
              {[
                { label: "Actifs", count: mandats.filter((m) => m.status === "actif").length, color: "#10b981" },
                { label: "Expirés", count: mandats.filter((m) => m.status === "expire").length, color: "#f59e0b" },
                { label: "Vacants", count: mandats.filter((m) => m.status === "vacant").length, color: "#ef4444" },
              ].map((s, i, arr) => (
                <View key={s.label} style={[styles.mandatStatCell, { borderColor: colors.border }, i < arr.length - 1 && { borderRightWidth: 1 }]}>
                  <Text style={[styles.mandatStatVal, { color: s.color }]}>{s.count}</Text>
                  <Text style={[styles.mandatStatLab, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          }
          renderItem={({ item: m }) => {
            const statusConfig = {
              actif: { label: "Actif", color: "#10b981", bg: "#10b98118" },
              expire: { label: "Expiré", color: "#f59e0b", bg: "#f59e0b18" },
              vacant: { label: "Vacant", color: "#ef4444", bg: "#ef444418" },
            }[m.status];
            return (
              <TouchableOpacity
                style={[styles.mandatCard, { backgroundColor: colors.card, borderColor: m.status === "vacant" ? "#ef444440" : colors.border }]}
                onPress={() => { setSelectedMandat(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.8}
              >
                <View style={[styles.mandatIconBox, { backgroundColor: statusConfig.bg }]}>
                  <Feather
                    name={m.status === "vacant" ? "user-x" : "award"}
                    size={18}
                    color={statusConfig.color}
                  />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.mandatPoste, { color: colors.foreground }]}>{m.poste}</Text>
                  <Text style={[styles.mandatHolder, { color: m.status === "vacant" ? colors.destructive : colors.mutedForeground }]}>
                    {m.holder || "Poste vacant"}
                  </Text>
                  <View style={styles.mandatMeta}>
                    <Feather name="briefcase" size={10} color={colors.mutedForeground} />
                    <Text style={[styles.mandatMetaText, { color: colors.mutedForeground }]}>{m.bureau}</Text>
                  </View>
                  {m.startDate ? (
                    <View style={styles.mandatMeta}>
                      <Feather name="calendar" size={10} color={colors.mutedForeground} />
                      <Text style={[styles.mandatMetaText, { color: colors.mutedForeground }]}>
                        {m.startDate} → {m.endDate}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={[styles.mandatStatusBadge, { backgroundColor: statusConfig.bg }]}>
                  <Text style={[styles.mandatStatusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : tab === "delegations" ? (
        <FlatList
          data={delegations}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={[styles.delegInfoBanner, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
              <Feather name="info" size={13} color={colors.primary} />
              <Text style={[styles.delegInfoText, { color: colors.primary }]}>
                {delegations.filter((d) => d.status === "active").length} délégation(s) active(s) en cours
              </Text>
            </View>
          }
          renderItem={({ item: d }) => {
            const dStatusConfig = {
              active: { label: "Active", color: "#10b981", bg: "#10b98118" },
              expired: { label: "Expirée", color: "#f59e0b", bg: "#f59e0b18" },
              revoked: { label: "Révoquée", color: "#ef4444", bg: "#ef444418" },
            }[d.status];
            return (
              <TouchableOpacity
                style={[styles.delegCard, { backgroundColor: colors.card, borderColor: d.status === "active" ? colors.primary + "40" : colors.border }]}
                onPress={() => { setSelectedDelegation(d); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.8}
              >
                <View style={styles.delegCardHeader}>
                  <View style={[styles.delegIcon, { backgroundColor: colors.primary + "15" }]}>
                    <Feather name="share-2" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.delegDomaine, { color: colors.foreground }]} numberOfLines={1}>{d.domaine}</Text>
                    <View style={styles.delegPeopleRow}>
                      <Text style={[styles.delegPerson, { color: colors.primary }]} numberOfLines={1}>{d.delegant}</Text>
                      <Feather name="arrow-right" size={10} color={colors.mutedForeground} />
                      <Text style={[styles.delegPerson, { color: colors.mutedForeground }]} numberOfLines={1}>{d.delegataire}</Text>
                    </View>
                  </View>
                  <View style={[styles.mandatStatusBadge, { backgroundColor: dStatusConfig.bg }]}>
                    <Text style={[styles.mandatStatusText, { color: dStatusConfig.color }]}>{dStatusConfig.label}</Text>
                  </View>
                </View>
                <Text style={[styles.delegDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{d.description}</Text>
                <View style={[styles.delegDateRow, { borderTopColor: colors.border }]}>
                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.delegDateText, { color: colors.mutedForeground }]}>
                    {d.startDate} → {d.endDate}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        /* Statuts tab */
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 40 }}>
          <View style={[styles.statNote, { backgroundColor: colors.primary + "08", borderColor: colors.primary + "20" }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[styles.statNoteText, { color: colors.primary }]}>
              Documents constitutifs et réglementaires du syndicat. Dernière mise à jour: Janvier 2026.
            </Text>
          </View>
          {[
            { title: "Statuts du syndicat", date: "Jan 2026", version: "v4.2", icon: "book-open" as const },
            { title: "Règlement intérieur", date: "Jan 2026", version: "v3.1", icon: "book" as const },
            { title: "Charte éthique", date: "Sep 2025", version: "v1.0", icon: "heart" as const },
            { title: "Procédures électorales", date: "Oct 2025", version: "v2.0", icon: "check-square" as const },
            { title: "Convention financière", date: "Mar 2026", version: "v1.3", icon: "dollar-sign" as const },
          ].map((doc) => (
            <TouchableOpacity
              key={doc.title}
              style={[styles.docRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert(doc.title, `Version ${doc.version} — ${doc.date}\n\nAppuyez sur "Télécharger" pour obtenir ce document.`);
              }}
            >
              <View style={[styles.docIcon, { backgroundColor: colors.primary + "15" }]}>
                <Feather name={doc.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docTitle, { color: colors.foreground }]}>{doc.title}</Text>
                <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>{doc.date} • {doc.version}</Text>
              </View>
              <TouchableOpacity
                style={[styles.docDownload, { backgroundColor: colors.primary + "15" }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert("Document téléchargé", `"${doc.title}" (${doc.version}) a été téléchargé avec succès.`);
                }}
              >
                <Feather name="download" size={15} color={colors.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Bureau member detail modal */}
      <Modal visible={!!selectedMember} animationType="slide" presentationStyle="pageSheet">
        {selectedMember ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelectedMember(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1, marginLeft: 12 }]}>
                Fiche bureau
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              {/* Profile */}
              <View style={[styles.memberProfile, { backgroundColor: colors.primary }]}>
                <View style={styles.memberProfileAvatar}>
                  <Text style={styles.memberProfileInitials}>
                    {selectedMember.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </Text>
                </View>
                <Text style={styles.memberProfileName}>{selectedMember.name}</Text>
                <Text style={styles.memberProfileRole}>{selectedMember.role}</Text>
                <Text style={styles.memberProfileSince}>Membre depuis {selectedMember.since}</Text>
              </View>

              {/* Contact */}
              {selectedMember.email ? (
                <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { icon: "mail" as const, label: "Email", value: selectedMember.email },
                    { icon: "phone" as const, label: "Téléphone", value: selectedMember.phone },
                  ].map((item, i) => (
                    <View key={item.label}>
                      {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                      <View style={styles.contactRow}>
                        <View style={[styles.contactIcon, { backgroundColor: colors.primary + "15" }]}>
                          <Feather name={item.icon} size={14} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.contactLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                          <Text style={[styles.contactValue, { color: colors.foreground }]}>{item.value}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Actions */}
              <View style={styles.memberActions}>
                <TouchableOpacity
                  style={[styles.memberActionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedMember(null);
                    router.push("/chat");
                  }}
                >
                  <Feather name="message-circle" size={15} color="#fff" />
                  <Text style={[styles.memberActionText, { color: "#fff" }]}>Contacter</Text>
                </TouchableOpacity>
                {isAdmin ? (
                  <TouchableOpacity
                    style={[styles.memberActionBtn, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "30", borderWidth: 1 }]}
                    onPress={() => handleRemoveMember(selectedMember.id, selectedMember.name)}
                  >
                    <Feather name="user-x" size={15} color={colors.destructive} />
                    <Text style={[styles.memberActionText, { color: colors.destructive }]}>Retirer</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Commission detail modal */}
      <Modal visible={!!selectedCommission} animationType="slide" presentationStyle="pageSheet">
        {selectedCommission ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelectedCommission(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1, marginLeft: 12 }]} numberOfLines={1}>
                {selectedCommission.name}
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
              <View style={[styles.commDetailHeader, { backgroundColor: colors.primary }]}>
                <Feather name="layers" size={30} color="rgba(255,255,255,0.3)" />
                <View>
                  <Text style={styles.commDetailName}>{selectedCommission.name}</Text>
                  <Text style={styles.commDetailMembers}>{selectedCommission.members} membres actifs</Text>
                </View>
              </View>
              <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Président(e)", value: selectedCommission.chair },
                  { label: "Membres", value: `${selectedCommission.members} personnes` },
                  { label: "Statut", value: selectedCommission.status === "active" ? "Active" : "Inactive" },
                  { label: "Prochaine réunion", value: selectedCommission.nextMeeting },
                ].map((item, i) => (
                  <View key={item.label}>
                    {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.contactRow}>
                      <Text style={[styles.contactLabel, { color: colors.mutedForeground, width: 120 }]}>{item.label}</Text>
                      <Text style={[styles.contactValue, { color: colors.foreground }]}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.memberActions}>
                <TouchableOpacity
                  style={[styles.memberActionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCommission(null);
                    router.push("/meetings");
                  }}
                >
                  <Feather name="calendar" size={15} color="#fff" />
                  <Text style={[styles.memberActionText, { color: "#fff" }]}>Planifier réunion</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.memberActionBtn, { backgroundColor: colors.secondary }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCommission(null);
                    router.push("/documents");
                  }}
                >
                  <Feather name="file-text" size={15} color={colors.primary} />
                  <Text style={[styles.memberActionText, { color: colors.primary }]}>Voir PVs</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Add bureau member modal */}
      {/* Mandat detail modal */}
      <Modal visible={!!selectedMandat} animationType="slide" presentationStyle="pageSheet">
        {selectedMandat ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelectedMandat(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1, marginLeft: 12 }]}>Détail du Mandat</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
              {(() => {
                const sc = { actif: { label: "Actif", color: "#10b981", bg: "#10b98118" }, expire: { label: "Expiré", color: "#f59e0b", bg: "#f59e0b18" }, vacant: { label: "Vacant", color: "#ef4444", bg: "#ef444418" } }[selectedMandat.status];
                return (
                  <>
                    <View style={[styles.mandatDetailHero, { backgroundColor: sc.bg, borderColor: sc.color + "40" }]}>
                      <View style={[styles.mandatDetailIconCircle, { backgroundColor: sc.color + "25" }]}>
                        <Feather name={selectedMandat.status === "vacant" ? "user-x" : "award"} size={28} color={sc.color} />
                      </View>
                      <Text style={[styles.mandatDetailPoste, { color: colors.foreground }]}>{selectedMandat.poste}</Text>
                      <View style={[styles.mandatStatusBadge, { backgroundColor: sc.bg, borderWidth: 1, borderColor: sc.color + "60" }]}>
                        <Text style={[styles.mandatStatusText, { color: sc.color }]}>{sc.label}</Text>
                      </View>
                    </View>
                    <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {[
                        { label: "Titulaire", value: selectedMandat.holder || "Poste vacant" },
                        { label: "Bureau", value: selectedMandat.bureau },
                        { label: "Début du mandat", value: selectedMandat.startDate || "—" },
                        { label: "Fin du mandat", value: selectedMandat.endDate || "—" },
                      ].map((row, i) => (
                        <View key={row.label}>
                          {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                          <View style={styles.contactRow}>
                            <Text style={[styles.contactLabel, { color: colors.mutedForeground, width: 130 }]}>{row.label}</Text>
                            <Text style={[styles.contactValue, { color: colors.foreground, flex: 1 }]}>{row.value}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    {isAdmin && selectedMandat.status === "vacant" ? (
                      <View style={{ gap: 10 }}>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.6 }}>NOM DU TITULAIRE À NOMMER</Text>
                        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 10 }}>
                          <TextInput
                            style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}
                            value={nomineeInput}
                            onChangeText={setNomineeInput}
                            placeholder="Prénom NOM du membre"
                            placeholderTextColor={colors.mutedForeground}
                          />
                        </View>
                        <TouchableOpacity
                          style={[styles.saveBtn, { backgroundColor: nomineeInput.trim() ? colors.primary : colors.border }]}
                          disabled={!nomineeInput.trim()}
                          onPress={() => {
                            if (!nomineeInput.trim()) return;
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setMandats((prev) => prev.map((m) => m.id === selectedMandat.id ? { ...m, holder: nomineeInput.trim(), status: "actif" as const, startDate: new Date().toISOString().slice(0, 10) } : m));
                            const nomme = nomineeInput.trim();
                            setNomineeInput("");
                            setSelectedMandat(null);
                            Alert.alert("Nomination confirmée", `${nomme} a été nommé(e) titulaire du poste "${selectedMandat.poste}".`);
                          }}
                        >
                          <Text style={[styles.saveBtnText, { color: "#fff" }]}>Confirmer la nomination</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Delegation detail modal */}
      <Modal visible={!!selectedDelegation} animationType="slide" presentationStyle="pageSheet">
        {selectedDelegation ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelectedDelegation(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1, marginLeft: 12 }]} numberOfLines={1}>
                {selectedDelegation.domaine}
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
              {(() => {
                const dc = { active: { label: "Active", color: "#10b981", bg: "#10b98118" }, expired: { label: "Expirée", color: "#f59e0b", bg: "#f59e0b18" }, revoked: { label: "Révoquée", color: "#ef4444", bg: "#ef444418" } }[selectedDelegation.status];
                return (
                  <>
                    <View style={[styles.delegDetailFlow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={{ alignItems: "center", flex: 1 }}>
                        <View style={[styles.delegPersonCircle, { backgroundColor: colors.primary + "15" }]}>
                          <Text style={[styles.delegPersonInitials, { color: colors.primary }]}>
                            {selectedDelegation.delegant.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </Text>
                        </View>
                        <Text style={[styles.delegPersonName, { color: colors.foreground }]} numberOfLines={2}>{selectedDelegation.delegant}</Text>
                        <Text style={[styles.delegPersonLabel, { color: colors.mutedForeground }]}>Délégant</Text>
                      </View>
                      <View style={{ alignItems: "center", gap: 4 }}>
                        <Feather name="arrow-right" size={20} color={colors.primary} />
                        <View style={[styles.mandatStatusBadge, { backgroundColor: dc.bg }]}>
                          <Text style={[styles.mandatStatusText, { color: dc.color }]}>{dc.label}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: "center", flex: 1 }}>
                        <View style={[styles.delegPersonCircle, { backgroundColor: "#6366f115" }]}>
                          <Text style={[styles.delegPersonInitials, { color: "#6366f1" }]}>
                            {selectedDelegation.delegataire.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </Text>
                        </View>
                        <Text style={[styles.delegPersonName, { color: colors.foreground }]} numberOfLines={2}>{selectedDelegation.delegataire}</Text>
                        <Text style={[styles.delegPersonLabel, { color: colors.mutedForeground }]}>Délégataire</Text>
                      </View>
                    </View>
                    <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {[
                        { label: "Domaine", value: selectedDelegation.domaine },
                        { label: "Début", value: selectedDelegation.startDate },
                        { label: "Échéance", value: selectedDelegation.endDate },
                      ].map((row, i) => (
                        <View key={row.label}>
                          {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                          <View style={styles.contactRow}>
                            <Text style={[styles.contactLabel, { color: colors.mutedForeground, width: 110 }]}>{row.label}</Text>
                            <Text style={[styles.contactValue, { color: colors.foreground, flex: 1 }]}>{row.value}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    <View style={[styles.delegDescBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[styles.delegDescLabel, { color: colors.mutedForeground }]}>Description</Text>
                      <Text style={[styles.delegDescBody, { color: colors.foreground }]}>{selectedDelegation.description}</Text>
                    </View>
                    {isAdmin && selectedDelegation.status === "active" ? (
                      <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: colors.destructive + "15", borderWidth: 1, borderColor: colors.destructive + "40" }]}
                        onPress={() => handleRevokeDelegation(selectedDelegation.id)}
                      >
                        <Text style={[styles.saveBtnText, { color: colors.destructive }]}>Révoquer cette délégation</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Add delegation modal */}
      <Modal visible={showAddDelegation} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouvelle Délégation</Text>
            <TouchableOpacity onPress={() => setShowAddDelegation(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 40 }}>
            {[
              { label: "Délégant *", value: newDelegant, setter: setNewDelegant, placeholder: "Nom du délégant" },
              { label: "Délégataire *", value: newDelegataire, setter: setNewDelegataire, placeholder: "Nom du délégataire" },
              { label: "Domaine *", value: newDomaine, setter: setNewDomaine, placeholder: "Ex: Représentation institutionnelle" },
              { label: "Description", value: newDelegDesc, setter: setNewDelegDesc, placeholder: "Description de la délégation de pouvoir..." },
            ].map((field) => (
              <View key={field.label} style={{ gap: 8 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{field.label}</Text>
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground, height: field.label === "Description" ? 80 : undefined, textAlignVertical: field.label === "Description" ? "top" : "center" }]}
                  value={field.value}
                  onChangeText={field.setter}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  multiline={field.label === "Description"}
                />
              </View>
            ))}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: newDelegant.trim() && newDelegataire.trim() && newDomaine.trim() ? colors.primary : colors.muted }]}
              onPress={handleAddDelegation}
              disabled={!newDelegant.trim() || !newDelegataire.trim() || !newDomaine.trim()}
            >
              <Text style={[styles.saveBtnText, { color: newDelegant.trim() && newDelegataire.trim() && newDomaine.trim() ? "#fff" : colors.mutedForeground }]}>
                Créer la délégation
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showAddMember} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Ajouter au bureau</Text>
            <TouchableOpacity onPress={() => setShowAddMember(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 24, gap: 16 }}>
            {[
              { label: "Nom complet *", value: newName, setter: setNewName, placeholder: "Prénom Nom" },
              { label: "Rôle / Poste *", value: newRole, setter: setNewRole, placeholder: "Ex: Secrétaire à la Communication" },
            ].map((field) => (
              <View key={field.label} style={{ gap: 8 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{field.label}</Text>
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                  value={field.value}
                  onChangeText={field.setter}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            ))}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: newName.trim() && newRole.trim() ? colors.primary : colors.muted }]}
              onPress={handleAddMember}
              disabled={!newName.trim() || !newRole.trim()}
            >
              <Text style={[styles.saveBtnText, { color: newName.trim() && newRole.trim() ? "#fff" : colors.mutedForeground }]}>
                Ajouter au bureau
              </Text>
            </TouchableOpacity>
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
  addBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  tabsScroll: { flexShrink: 0, borderBottomWidth: 1 },
  tabBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 14, minWidth: 90 },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  /* Mandats tab */
  mandatsHeader: { flexDirection: "row", backgroundColor: "transparent", borderRadius: 14, overflow: "hidden", marginBottom: 8 },
  mandatStatCell: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 2 },
  mandatStatVal: { fontSize: 22, fontFamily: "Inter_700Bold" },
  mandatStatLab: { fontSize: 11, fontFamily: "Inter_400Regular" },
  mandatCard: { flexDirection: "row", alignItems: "flex-start", padding: 14, borderRadius: 16, borderWidth: 1, gap: 12 },
  mandatIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  mandatPoste: { fontSize: 14, fontFamily: "Inter_700Bold" },
  mandatHolder: { fontSize: 12, fontFamily: "Inter_500Medium" },
  mandatMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  mandatMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  mandatStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  mandatStatusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  mandatDetailHero: { alignItems: "center", gap: 12, padding: 24, borderRadius: 20, borderWidth: 1 },
  mandatDetailIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  mandatDetailPoste: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  /* Delegations tab */
  delegInfoBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  delegInfoText: { fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  delegCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  delegCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  delegIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  delegDomaine: { fontSize: 14, fontFamily: "Inter_700Bold" },
  delegPeopleRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  delegPerson: { fontSize: 11, fontFamily: "Inter_500Medium" },
  delegDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  delegDateRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8, borderTopWidth: 1 },
  delegDateText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  delegDetailFlow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderRadius: 16, borderWidth: 1, gap: 8 },
  delegPersonCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  delegPersonInitials: { fontSize: 18, fontFamily: "Inter_700Bold" },
  delegPersonName: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  delegPersonLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  delegDescBox: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  delegDescLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  delegDescBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  mandatBadge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  mandatText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  levelCenter: { alignItems: "center" },
  presidentCard: { width: 200, borderRadius: 20, borderWidth: 2, padding: 20, alignItems: "center", gap: 6 },
  presAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  presInitials: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  presName: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  presRole: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", textAlign: "center", lineHeight: 15 },
  presSince: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 4 },
  presSinceText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.8)" },
  connector: { width: 2, height: 28, alignSelf: "center" },
  vpCard: { width: 200, borderRadius: 16, borderWidth: 1.5, padding: 16, alignItems: "center", gap: 6 },
  vpAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  vpInitials: { fontSize: 18, fontFamily: "Inter_700Bold" },
  vpName: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  vpRole: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 15 },
  bureauSectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  bureauGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  bureauCard: { flex: 1, minWidth: "45%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  bureauIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bureauName: { fontSize: 12, fontFamily: "Inter_700Bold" },
  bureauRole: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  commHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  commHeaderText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  commCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, gap: 12 },
  commIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  commName2: { fontSize: 14, fontFamily: "Inter_700Bold" },
  commMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  commMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  commMetaDot: { fontSize: 11 },
  commStatus: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  commStatusDot: { width: 6, height: 6, borderRadius: 3 },
  commStatusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  statNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  docRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  docIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  docMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  docDownload: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 20, borderBottomWidth: 1, gap: 4 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  memberProfile: { borderRadius: 20, padding: 24, alignItems: "center", gap: 6 },
  memberProfileAvatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  memberProfileInitials: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  memberProfileName: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  memberProfileRole: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", textAlign: "center" },
  memberProfileSince: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },
  contactCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  sep: { height: 1, marginVertical: 6 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  contactIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  contactLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  contactValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  memberActions: { flexDirection: "row", gap: 10 },
  memberActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 13 },
  memberActionText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  commDetailHeader: { flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 18, padding: 20 },
  commDetailName: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  commDetailMembers: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 3 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

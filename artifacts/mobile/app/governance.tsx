import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { shareContent } from "@/hooks/useShare";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";
import { useLanguage } from "@/context/LanguageContext";
import { ErrorState, LoadingState } from "@/components/DataState";
import EmptyState from "@/components/EmptyState";

type BureauMember = { id: string; name: string; role: string; icon: keyof typeof Feather.glyphMap; since: string; email: string; phone: string };
type Commission = { id: string; name: string; members: number; status: "active" | "inactive"; chair: string; nextMeeting: string };

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

export default function GovernanceScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "president", "secretary", "committee_member"]}>
      <GovernanceScreenInner />
    </RoleGuard>
  );
}

function GovernanceScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabType>("organigramme");
  const [bureau, setBureau] = useState<BureauMember[]>([]);
  const [commissions] = useState<Commission[]>([]);
  const [mandats, setMandats] = useState<Mandat[]>([]);
  const [nomineeInput, setNomineeInput] = useState("");
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<BureauMember | null>(null);
  const [selectedCommission, setSelectedCommission] = useState<Commission | null>(null);
  const [selectedMandat, setSelectedMandat] = useState<Mandat | null>(null);
  const [selectedDelegation, setSelectedDelegation] = useState<Delegation | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  // FIX [Governance Bug]: Previously `role !== "member"` accidentally granted
  // admin UI to tenants. Must explicitly list management roles.
  const isAdmin = ["super_admin", "syndicate_admin", "president", "treasurer", "secretary", "committee_member"].includes(user?.role ?? "");

  const loadGovernance = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [bureauResult, mandateResult, delegationResult] = await Promise.all([
        apiRequest<{ data: BureauMember[] }>("/governance/conseil"),
        apiRequest<{ data: Mandat[] }>("/governance/mandats"),
        apiRequest<{ data: Delegation[] }>("/governance/delegations"),
      ]);
      setBureau(bureauResult.data ?? []);
      setMandats(mandateResult.data ?? []);
      setDelegations(delegationResult.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGovernance();
  }, [loadGovernance]);

  const president = bureau[0];
  const vp = bureau[1];
  const restBureau = bureau.slice(2);

  const handleAddMember = async () => {
    if (!newName.trim() || !newRole.trim()) return;
    setSaving(true);
    try {
      await apiRequest("/governance/conseil", "POST", {
        name: newName.trim(),
        role: newRole.trim(),
        mandateStart: new Date().toISOString().slice(0, 10),
      });
      await loadGovernance(true);
      setShowAddMember(false);
      setNewName(""); setNewRole("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("governanceSavedTitle"), message: t("governanceMemberAdded") });
    } catch {
      showToast({ type: "error", title: t("governanceSaveErrorTitle"), message: t("governanceSaveErrorMessage") });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = (id: string, name: string) => {
    Alert.alert(t("governanceRemoveTitle"), t("governanceRemoveQuestion").replace("{name}", name), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("governanceRemove"),
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest(`/governance/conseil/${id}`, "DELETE");
            await loadGovernance(true);
            setSelectedMember(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            showToast({ type: "success", title: t("governanceSavedTitle"), message: t("governanceMemberRemoved") });
          } catch {
            showToast({ type: "error", title: t("governanceSaveErrorTitle"), message: t("governanceSaveErrorMessage") });
          }
        },
      },
    ]);
  };

  const TABS: { key: TabType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: "organigramme", label: t("governanceBureau"), icon: "users" },
    { key: "commissions", label: t("governanceCommissions"), icon: "layers" },
    { key: "mandats", label: t("governanceMandates"), icon: "award" },
    { key: "delegations", label: t("governanceDelegations"), icon: "share-2" },
    { key: "documents", label: t("governanceStatutes"), icon: "file-text" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("governanceTitle")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {t("governanceMandatePeriod")}
          </Text>
        </View>
        {isAdmin && tab === "organigramme" ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowAddMember(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="user-plus" size={16} color="#fff" />
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

      {loading ? (
        <LoadingState title={t("governanceLoadingTitle")} description={t("governanceLoadingDescription")} />
      ) : loadError ? (
        <ErrorState
          title={t("governanceLoadErrorTitle")}
          description={t("governanceLoadErrorDescription")}
          retryLabel={t("retry")}
          onRetry={() => void loadGovernance()}
        />
      ) : tab === "organigramme" ? (
        bureau.length === 0 ? (
          <EmptyState
            icon="users"
            title={t("governanceEmptyTitle")}
            description={t("governanceEmptyDescription")}
            actionLabel={isAdmin ? t("governanceAddToBoard") : undefined}
            onAction={isAdmin ? () => setShowAddMember(true) : undefined}
          />
        ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          {/* Mandate badge */}
          <View style={[styles.mandatBadge, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={[styles.mandatText, { color: colors.primary }]}>
              {t("governanceCurrentMandate")}: 2023–2026 • {bureau.length} {t("governanceBoardMembers")}
            </Text>
          </View>

          {/* President */}
          {vp ? <View style={styles.levelCenter}>
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
                <Text style={styles.presSinceText}>{t("governanceSince")} {president.since}</Text>
              </View>
            </TouchableOpacity>
          </View> : null}

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
          <Text style={[styles.bureauSectionLabel, { color: colors.mutedForeground }]}>{t("governanceBoardMembersTitle")}</Text>
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
        )
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
                {commissions.filter((c) => c.status === "active").length} {t("governanceActiveCommissions")}
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
                  <Text style={[styles.commMetaText, { color: colors.mutedForeground }]}>{c.members} {t("governanceMembers")}</Text>
                  <Text style={[styles.commMetaDot, { color: colors.mutedForeground }]}>•</Text>
                  <Text style={[styles.commMetaText, { color: colors.mutedForeground }]}>{t("governanceChairPrefix")}: {c.chair.split(" ")[0]}</Text>
                </View>
                <View style={styles.commMeta}>
                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.commMetaText, { color: colors.mutedForeground }]}>{t("governanceNextMeeting")}: {c.nextMeeting}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <View style={[styles.commStatus, { backgroundColor: c.status === "active" ? colors.success + "15" : colors.muted }]}>
                  <View style={[styles.commStatusDot, { backgroundColor: c.status === "active" ? colors.success : colors.mutedForeground }]} />
                  <Text style={[styles.commStatusText, { color: c.status === "active" ? colors.success : colors.mutedForeground }]}>
                    {c.status === "active" ? t("governanceActiveStatus") : t("governanceInactiveStatus")}
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="layers"
              title={t("governanceCommissionsEmptyTitle")}
              description={t("governanceCommissionsEmptyDescription")}
            />
          }
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
                { label: t("governanceActive"), count: mandats.filter((m) => m.status === "actif").length, color: "#10b981" },
                { label: t("governanceExpired"), count: mandats.filter((m) => m.status === "expire").length, color: "#f59e0b" },
                { label: t("governanceVacant"), count: mandats.filter((m) => m.status === "vacant").length, color: "#ef4444" },
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
              actif: { label: t("statusActive"), color: "#10b981", bg: "#10b98118" },
              expire: { label: t("governanceExpiredSingular"), color: "#f59e0b", bg: "#f59e0b18" },
              vacant: { label: t("governanceVacantSingular"), color: "#ef4444", bg: "#ef444418" },
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
                    {m.holder || t("governanceVacantPosition")}
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
          ListEmptyComponent={
            <EmptyState
              icon="award"
              title={t("governanceMandatesEmptyTitle")}
              description={t("governanceMandatesEmptyDescription")}
            />
          }
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
                {delegations.filter((d) => d.status === "active").length} {t("governanceDelegationsActive")}
              </Text>
            </View>
          }
          renderItem={({ item: d }) => {
            const dStatusConfig = {
              active: { label: t("governanceActiveStatus"), color: "#10b981", bg: "#10b98118" },
              expired: { label: t("governanceExpiredSingular"), color: "#f59e0b", bg: "#f59e0b18" },
              revoked: { label: t("governanceRevoke"), color: "#ef4444", bg: "#ef444418" },
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
          ListEmptyComponent={
            <EmptyState
              icon="share-2"
              title={t("governanceDelegationsEmptyTitle")}
              description={t("governanceDelegationsEmptyDescription")}
            />
          }
        />
      ) : (
        /* Statuts tab */
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 40 }}>
          <View style={[styles.statNote, { backgroundColor: colors.primary + "08", borderColor: colors.primary + "20" }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[styles.statNoteText, { color: colors.primary }]}>
               {t("governanceDocumentsNote")}
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
                router.push("/documents");
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
                  shareContent(`${doc.title} — ${doc.version} (${doc.date})`, doc.title);
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
              <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1, marginStart: 12 }]}>
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
                <Text style={styles.memberProfileSince}>{t("governanceMemberSince")} {selectedMember.since}</Text>
              </View>

              {/* Contact */}
              {selectedMember.email ? (
                <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {[
                      { icon: "mail" as const, label: t("email"), value: selectedMember.email },
                      { icon: "phone" as const, label: t("phoneLabel"), value: selectedMember.phone },
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
                  <Text style={[styles.memberActionText, { color: "#fff" }]}>{t("governanceContact")}</Text>
                </TouchableOpacity>
                {isAdmin ? (
                  <TouchableOpacity
                    style={[styles.memberActionBtn, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "30", borderWidth: 1 }]}
                    onPress={() => handleRemoveMember(selectedMember.id, selectedMember.name)}
                  >
                    <Feather name="user-x" size={15} color={colors.destructive} />
                    <Text style={[styles.memberActionText, { color: colors.destructive }]}>{t("governanceRemove")}</Text>
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
              <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1, marginStart: 12 }]} numberOfLines={1}>
                {selectedCommission.name}
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
              <View style={[styles.commDetailHeader, { backgroundColor: colors.primary }]}>
                <Feather name="layers" size={30} color="rgba(255,255,255,0.3)" />
                <View>
                  <Text style={styles.commDetailName}>{selectedCommission.name}</Text>
                  <Text style={styles.commDetailMembers}>{selectedCommission.members} {t("governanceMembers")} {t("governanceActiveStatus").toLowerCase()}</Text>
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
                  <Text style={[styles.memberActionText, { color: "#fff" }]}>{t("governanceScheduleMeeting")}</Text>
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
                  <Text style={[styles.memberActionText, { color: colors.primary }]}>{t("governanceViewMinutes")}</Text>
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
              <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1, marginStart: 12 }]}>{t("governanceMandateDetail")}</Text>
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
                        { label: t("governanceHolder"), value: selectedMandat.holder || t("governanceVacantPosition") },
                        { label: t("governanceBoard"), value: selectedMandat.bureau },
                        { label: t("governanceTermStart"), value: selectedMandat.startDate || "—" },
                        { label: t("governanceTermEnd"), value: selectedMandat.endDate || "—" },
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
                        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.6 }}>{t("governanceNomineeLabel")}</Text>
                        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 10 }}>
                          <TextInput
                            style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}
                            value={nomineeInput}
                            onChangeText={setNomineeInput}
                            placeholder={t("governanceNomineePlaceholder")}
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
                             showToast({
                               type: "success",
                               title: t("governanceNominationConfirmed"),
                               message: t("governanceNominationMessage")
                                 .replace("{name}", nomme)
                                 .replace("{post}", selectedMandat.poste),
                             });
                          }}
                        >
                          <Text style={[styles.saveBtnText, { color: "#fff" }]}>{t("governanceConfirmNomination")}</Text>
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
              <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1, marginStart: 12 }]} numberOfLines={1}>
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
                        <Text style={[styles.delegPersonLabel, { color: colors.mutedForeground }]}>{t("governanceDelegator")}</Text>
                      </View>
                      <View style={{ alignItems: "center", gap: 4 }}>
                        <Feather name="arrow-right" size={20} color={colors.primary} />
                        <View style={[styles.mandatStatusBadge, { backgroundColor: dc.bg }]}>
                          <Text style={[styles.mandatStatusText, { color: dc.color }]}>{dc.label}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: "center", flex: 1 }}>
                        <View style={[styles.delegPersonCircle, { backgroundColor: "#1F5EFF15" }]}>
                          <Text style={[styles.delegPersonInitials, { color: "#1F5EFF" }]}>
                            {selectedDelegation.delegataire.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </Text>
                        </View>
                        <Text style={[styles.delegPersonName, { color: colors.foreground }]} numberOfLines={2}>{selectedDelegation.delegataire}</Text>
                        <Text style={[styles.delegPersonLabel, { color: colors.mutedForeground }]}>{t("governanceDelegate")}</Text>
                      </View>
                    </View>
                    <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {[
                         { label: t("governanceDomain"), value: selectedDelegation.domaine },
                         { label: t("governanceStart"), value: selectedDelegation.startDate },
                         { label: t("governanceDueDate"), value: selectedDelegation.endDate },
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
                      <Text style={[styles.delegDescLabel, { color: colors.mutedForeground }]}>{t("governanceDescription")}</Text>
                      <Text style={[styles.delegDescBody, { color: colors.foreground }]}>{selectedDelegation.description}</Text>
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      <Modal visible={showAddMember} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("governanceAddToBoard")}</Text>
            <TouchableOpacity onPress={() => setShowAddMember(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 24, gap: 16 }}>
            {[
              { label: t("governanceFullName"), value: newName, setter: setNewName, placeholder: t("governanceFullNamePlaceholder") },
              { label: t("governanceRolePost"), value: newRole, setter: setNewRole, placeholder: t("governanceRolePlaceholder") },
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
                {saving ? t("saving") : t("governanceAddToBoard")}
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

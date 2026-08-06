import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData, type Member, type Syndicate } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import FilterTabs from "@/components/FilterTabs";
import { useToast } from "@/context/ToastContext";
import { chat as chatApi } from "@/services/api";
import { apiRequest } from "@/lib/api";

type MemberFilter = "all" | "active" | "inactive" | "pending";

export default function MembersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { members, syndicates, addMember, addSyndicate, updateSyndicateStatus, updateMemberStatus } = useData();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newProfession, setNewProfession] = useState("");

  const [submittingMember, setSubmittingMember] = useState(false);
  const [submittingSyndicate, setSubmittingSyndicate] = useState(false);

  // Super admin - add syndicate state
  const [showAddSyndicate, setShowAddSyndicate] = useState(false);
  const [synName, setSynName] = useState("");
  const [synSector, setSynSector] = useState("");
  const [synRegion, setSynRegion] = useState("");
  const [synAdmin, setSynAdmin] = useState("");
  const [selectedSyndicate, setSelectedSyndicate] = useState<Syndicate | null>(null);
  const [syndicateModalView, setSyndicateModalView] = useState<"detail" | "members">("detail");
  const [contactingAdmin, setContactingAdmin] = useState(false);

  const closeSyndicateModal = () => {
    setSelectedSyndicate(null);
    setSyndicateModalView("detail");
  };

  const navigateFromSyndicateModal = (path: string) => {
    closeSyndicateModal();
    setTimeout(() => router.push(path as any), 300);
  };

  const handleContactAdmin = useCallback(async (syndicate: Syndicate) => {
    if (contactingAdmin) return;
    setContactingAdmin(true);
    try {
      const params = syndicate.adminId
        ? { participantId: syndicate.adminId, convType: "direct" as const }
        : { syndicateAdminLookup: syndicate.id, convType: "direct" as const };
      const res = await chatApi.create(params) as any;
      const convId = res?.data?.id;
      closeSyndicateModal();
      if (convId) {
        setTimeout(() => router.push(`/chat-thread?id=${convId}` as any), 300);
      } else {
        setTimeout(() => router.push("/chat" as any), 300);
      }
    } catch {
      closeSyndicateModal();
      setTimeout(() => router.push("/chat" as any), 300);
    } finally {
      setContactingAdmin(false);
    }
  }, [contactingAdmin]);

  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const isSuperAdmin = user?.role === "super_admin";
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const filtered = members.filter((m) => {
    const matchSearch =
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.profession.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || m.status === filter;
    return matchSearch && matchFilter;
  });

  const FILTERS: { key: MemberFilter; label: string }[] = [
    { key: "all",      label: t("all") },
    { key: "active",   label: t("statusActive") },
    { key: "inactive", label: t("filterInactifs") },
    { key: "pending",  label: t("statusPending") },
  ];

  const handleAdd = async () => {
    if (!newName.trim() || submittingMember) return;
    setSubmittingMember(true);
    try {
      const { data } = await apiRequest<{ data: any }>("/members", "POST", {
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        profession: newProfession.trim() || "Non spécifié",
        joinDate: new Date().toISOString().slice(0, 10),
      });
      const member: Member = {
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone ?? "",
        profession: data.profession ?? "Non spécifié",
        joinDate: data.joinDate ?? new Date().toISOString().slice(0, 10),
        status: data.status ?? "pending",
        cotisationStatus: data.cotisationStatus ?? "pending",
        syndicate: user?.syndicate ?? "",
      };
      addMember(member);
      setShowAdd(false);
      setNewName(""); setNewEmail(""); setNewPhone(""); setNewProfession("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("success"), message: `${member.name} — ${t("memberAdded") ?? "ajouté"}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("errorGeneric");
      showToast({ type: "error", title: t("error"), message: msg });
    } finally {
      setSubmittingMember(false);
    }
  };

  const handleAddSyndicate = async () => {
    if (!synName.trim() || submittingSyndicate) return;
    setSubmittingSyndicate(true);
    try {
      const { data } = await apiRequest<{ data: any }>("/syndicates", "POST", {
        name: synName.trim(),
        sector: synSector.trim() || "Général",
        region: synRegion.trim() || "National",
      });
      const s: Syndicate = {
        id: data.id,
        name: data.name,
        sector: data.sector ?? (synSector.trim() || "Général"),
        members: data.membersCount ?? 0,
        admin: synAdmin.trim() || "Non assigné",
        status: data.status ?? "active",
        createdAt: data.createdAt ?? new Date().toISOString().slice(0, 10),
        region: data.region ?? (synRegion.trim() || "National"),
      };
      addSyndicate(s);
      setShowAddSyndicate(false);
      setSynName(""); setSynSector(""); setSynRegion(""); setSynAdmin("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("success"), message: `${s.name}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("errorGeneric");
      showToast({ type: "error", title: t("error"), message: msg });
    } finally {
      setSubmittingSyndicate(false);
    }
  };

  const statusConfig = (status: Member["status"]) => ({
    active:   { color: colors.success,     label: t("statusActive") },
    inactive: { color: colors.destructive, label: t("statusInactive") },
    pending:  { color: "#f59e0b",          label: t("statusPending") },
  }[status]);

  const cotConfig = (status: Member["cotisationStatus"]) => ({
    paid:    { color: colors.success,     label: t("paid") },
    pending: { color: "#f59e0b",          label: t("statusPending") },
    overdue: { color: colors.destructive, label: t("latePayment") },
  }[status]);

  // Super Admin view
  if (isSuperAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>{t("syndicatsTitle")}</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {syndicates.length} syndicats • {syndicates.filter((s) => s.status === "active").length} {t("statusActive").toLowerCase()}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.secondary }]}
                onPress={() => { router.push("/search" as any); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Feather name="search" size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={() => { setShowAddSyndicate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Feather name="plus" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <FlatList
          data={syndicates}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              style={[styles.syndicateCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setSelectedSyndicate(s)}
              activeOpacity={0.8}
            >
              <View style={[styles.syndicateIcon, { backgroundColor: colors.primary + "15" }]}>
                <Text style={[styles.syndicateInitials, { color: colors.primary }]}>
                  {s.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.syndicateName, { color: colors.foreground }]} numberOfLines={1}>{s.name}</Text>
                <Text style={[styles.syndicateMeta, { color: colors.mutedForeground }]}>{s.sector} • {s.region}</Text>
                <View style={styles.syndicateRow}>
                  <Feather name="users" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.syndicateMeta, { color: colors.mutedForeground }]}>{s.members} {t("syndicatMembersCount").toLowerCase()}</Text>
                  <Text style={[styles.syndicateMeta, { color: colors.mutedForeground }]}>•</Text>
                  <Text style={[styles.syndicateMeta, { color: colors.mutedForeground }]}>{t("syndicatAdminLabel")}: {s.admin}</Text>
                </View>
              </View>
              <View style={styles.syndicateRight}>
                <View style={[styles.statusDot, { backgroundColor: s.status === "active" ? colors.success : colors.destructive }]} />
                <Text style={[styles.statusLabel, { color: s.status === "active" ? colors.success : colors.destructive }]}>
                  {s.status === "active" ? t("statusActive") : t("statusInactive")}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />

        {/* Syndicate detail / members modal */}
        <Modal visible={!!selectedSyndicate} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSyndicateModal}>
          {selectedSyndicate && syndicateModalView === "detail" ? (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedSyndicate.name}
                </Text>
                <TouchableOpacity onPress={closeSyndicateModal}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={[1]}
                keyExtractor={() => "detail"}
                contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
                renderItem={() => (
                  <View style={{ gap: 16 }}>
                    <View style={[styles.synDetailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {[
                        { label: t("syndicatSector"),      value: selectedSyndicate.sector },
                        { label: t("syndicatRegion"),      value: selectedSyndicate.region },
                        { label: t("syndicatAdminLabel"),  value: selectedSyndicate.admin },
                        { label: t("syndicatMembersCount"),value: `${selectedSyndicate.members}` },
                        { label: t("syndicatCreatedAt"),   value: selectedSyndicate.createdAt },
                        { label: t("syndicatStatusLabel"), value: selectedSyndicate.status === "active" ? t("statusActive") : t("statusInactive") },
                      ].map((item, i) => (
                        <View key={item.label}>
                          {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                          <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                            <Text style={[styles.detailValue, { color: colors.foreground }]}>{item.value}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    <View style={styles.synActions}>
                      {[
                        {
                          label: t("viewMembersLabel"),
                          icon: "users" as const,
                          color: colors.primary,
                          onPress: () => { setSyndicateModalView("members"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); },
                        },
                        {
                          label: contactingAdmin ? t("openingLabel") : t("contactAdminLabel"),
                          icon: "message-circle" as const,
                          color: "#3b82f6",
                          onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleContactAdmin(selectedSyndicate!); },
                        },
                        {
                          label: selectedSyndicate.status === "active" ? t("deactivate") : t("activate"),
                          icon: selectedSyndicate.status === "active" ? "user-x" as const : "user-check" as const,
                          color: selectedSyndicate.status === "active" ? colors.destructive : colors.success,
                          onPress: () => {
                            const newStatus = selectedSyndicate.status === "active" ? "inactive" as const : "active" as const;
                            const label = newStatus === "active" ? t("activate") : t("deactivate");
                            Alert.alert(label, `${selectedSyndicate.name}?`, [
                              { text: t("cancel"), style: "cancel" },
                              {
                                text: label,
                                style: newStatus === "active" ? "default" : "destructive",
                                onPress: () => {
                                  updateSyndicateStatus(selectedSyndicate.id, newStatus);
                                  setSelectedSyndicate({ ...selectedSyndicate, status: newStatus });
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  showToast({ type: "success", title: t("success"), message: selectedSyndicate.name });
                                },
                              },
                            ]);
                          },
                        },
                        {
                          label: t("tableauNationalLabel"),
                          icon: "globe" as const,
                          color: "#6366f1",
                          onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigateFromSyndicateModal("/tableau-national"); },
                        },
                      ].map((action) => (
                        <TouchableOpacity
                          key={action.label}
                          style={[styles.synAction, { backgroundColor: action.color + "15", borderColor: action.color + "30" }]}
                          onPress={action.onPress}
                          activeOpacity={0.75}
                        >
                          <Feather name={action.icon} size={16} color={action.color} />
                          <Text style={[styles.synActionText, { color: action.color }]}>{action.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              />
            </View>
          ) : selectedSyndicate && syndicateModalView === "members" ? (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setSyndicateModalView("detail")} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <Feather name={isRTL ? "chevron-right" : "chevron-left"} size={20} color={colors.foreground} />
                  <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {t("syndicatMembersCount")} — {selectedSyndicate.name}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={closeSyndicateModal}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              {(() => {
                const synMembers = members.filter((m) =>
                  m.syndicate.toLowerCase().includes(selectedSyndicate.name.split(" ").pop()?.toLowerCase() ?? "__") ||
                  selectedSyndicate.name.toLowerCase().includes(m.syndicate.toLowerCase()) ||
                  m.syndicate === selectedSyndicate.id
                );
                const displayMembers = synMembers.length > 0 ? synMembers : members;
                return (
                  <FlatList
                    data={displayMembers}
                    keyExtractor={(m) => m.id}
                    contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>
                        {displayMembers.length} {t("membersInSyndicate")}
                      </Text>
                    }
                    renderItem={({ item: m }) => {
                      const sc = {
                        active:   { color: colors.success,     label: t("statusActive") },
                        inactive: { color: colors.destructive, label: t("statusInactive") },
                        pending:  { color: "#f59e0b",          label: t("statusPending") },
                      }[m.status];
                      return (
                        <TouchableOpacity
                          style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigateFromSyndicateModal(`/member-detail?id=${m.id}`); }}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.memberAvatar, { backgroundColor: colors.primary + "15" }]}>
                            <Text style={[styles.memberInitials, { color: colors.primary }]}>
                              {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text style={[styles.memberName, { color: colors.foreground }]}>{m.name}</Text>
                            <Text style={[styles.memberProfession, { color: colors.mutedForeground }]}>{m.profession}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: sc.color + "15" }]}>
                            <View style={[styles.statusDot, { backgroundColor: sc.color }]} />
                            <Text style={[styles.statusBadgeText, { color: sc.color }]}>{sc.label}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                );
              })()}
            </View>
          ) : null}
        </Modal>

        {/* Add syndicate modal */}
        <Modal visible={showAddSyndicate} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("newSyndicate") ?? "Nouveau syndicat"}</Text>
              <TouchableOpacity onPress={() => setShowAddSyndicate(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[1]}
              keyExtractor={() => "form"}
              contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}
              renderItem={() => (
                <View style={{ gap: 14 }}>
                  {[
                    { label: t("nomSyndicat"),    value: synName,   setter: setSynName,   placeholder: "Syndicat National des..." },
                    { label: t("syndicatSector"), value: synSector, setter: setSynSector, placeholder: "Éducation, Santé..." },
                    { label: t("syndicatRegion"), value: synRegion, setter: setSynRegion, placeholder: "National, Casablanca..." },
                    { label: t("syndicatAdminLabel"), value: synAdmin, setter: setSynAdmin, placeholder: "Nom de l'administrateur" },
                  ].map((field) => (
                    <View key={field.label} style={{ gap: 6 }}>
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
                    style={[styles.saveBtn, { backgroundColor: synName.trim() && !submittingSyndicate ? colors.primary : colors.muted }]}
                    onPress={handleAddSyndicate}
                    disabled={!synName.trim() || submittingSyndicate}
                  >
                    {submittingSyndicate ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={[styles.saveBtnText, { color: synName.trim() ? "#fff" : colors.mutedForeground }]}>
                        {t("createSyndicatBtn")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </Modal>
      </View>
    );
  }

  // Syndicate admin view
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>{t("copropriétairesTitle")}</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {filtered.length} / {members.length} {t("copropriétairesTitle").toLowerCase()}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowAdd(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={t("searchMemberPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
        </View>
      </View>

      <FilterTabs
        options={FILTERS}
        value={filter}
        onChange={(k) => setFilter(k as MemberFilter)}
        accentColor={colors.primary}
      />

      <FlatList
        data={filtered}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noMembers")}</Text>
          </View>
        }
        renderItem={({ item: m }) => {
          const sc = statusConfig(m.status);
          const cc = cotConfig(m.cotisationStatus);
          const isPending = m.status === "pending";
          return (
            <View style={[styles.memberCard, { backgroundColor: colors.card, borderColor: isPending ? "#f59e0b" : colors.border, borderLeftWidth: isPending ? 4 : 1, borderLeftColor: isPending ? "#f59e0b" : colors.border }]}>
              <TouchableOpacity
                style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/member-detail", params: { id: m.id } }); }}
                activeOpacity={0.8}
              >
                <View style={[styles.memberAvatar, { backgroundColor: isPending ? "#f59e0b18" : colors.primary + "15" }]}>
                  <Text style={[styles.memberInitials, { color: isPending ? "#f59e0b" : colors.primary }]}>
                    {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.memberName, { color: colors.foreground }]}>{m.name}</Text>
                    {isPending && (
                      <View style={{ backgroundColor: "#f59e0b18", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>{t("statusEnAttenteBadge")}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.memberProfession, { color: colors.mutedForeground }]}>{m.profession}</Text>
                  <View style={[styles.memberMeta, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Feather name="calendar" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.memberDate, { color: colors.mutedForeground }]}>{m.joinDate.slice(0, 7)}</Text>
                  </View>
                </View>
                {!isPending && (
                  <View style={styles.memberRight}>
                    <View style={[styles.statusBadge, { backgroundColor: sc.color + "15" }]}>
                      <View style={[styles.statusDot, { backgroundColor: sc.color }]} />
                      <Text style={[styles.statusBadgeText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                    <View style={[styles.cotBadge, { backgroundColor: cc.color + "15" }]}>
                      <Text style={[styles.cotBadgeText, { color: cc.color }]}>{cc.label}</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              {isPending && (
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.destructive + "15", borderWidth: 1, borderColor: colors.destructive + "30" }}
                    onPress={() => {
                      Alert.alert(t("rejectRequestLabel"), `${m.name}?`, [
                        { text: t("cancel"), style: "cancel" },
                        { text: t("rejectBtn"), style: "destructive", onPress: () => { updateMemberStatus(m.id, "inactive"); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } },
                      ]);
                    }}
                  >
                    <Feather name="x" size={14} color={colors.destructive} />
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.destructive }}>{t("rejectBtn")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.success + "18", borderWidth: 1, borderColor: colors.success + "40" }}
                    onPress={() => {
                      updateMemberStatus(m.id, "active");
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }}
                  >
                    <Feather name="check" size={14} color={colors.success} />
                    <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.success }}>{t("approveRequest")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Add member modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("addMember")}</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={[1]}
            keyExtractor={() => "form"}
            contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}
            renderItem={() => (
              <View style={{ gap: 14 }}>
                {[
                  { label: t("nomComplet"),     value: newName,       setter: setNewName,       placeholder: "Mohammed Alaoui" },
                  { label: t("email"),          value: newEmail,      setter: setNewEmail,      placeholder: "email@exemple.com" },
                  { label: t("phone"),          value: newPhone,      setter: setNewPhone,      placeholder: "+212 6 XX XX XX XX" },
                  { label: t("professionLabel"),value: newProfession, setter: setNewProfession, placeholder: "Professeur" },
                ].map((field) => (
                  <View key={field.label} style={{ gap: 6 }}>
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
                  style={[styles.saveBtn, { backgroundColor: newName.trim() && !submittingMember ? colors.primary : colors.muted }]}
                  onPress={handleAdd}
                  disabled={!newName.trim() || submittingMember}
                >
                  {submittingMember ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.saveBtnText, { color: newName.trim() ? "#fff" : colors.mutedForeground }]}>
                      {t("saveMemberBtn")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  memberCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, gap: 12 },
  memberAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  memberInitials: { fontSize: 16, fontFamily: "Inter_700Bold" },
  memberName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  memberProfession: { fontSize: 12, fontFamily: "Inter_400Regular" },
  memberMeta: { alignItems: "center", gap: 4 },
  memberDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  memberRight: { alignItems: "flex-end", gap: 6 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cotBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  cotBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  syndicateCard: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 16, borderWidth: 1, gap: 14 },
  syndicateIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  syndicateInitials: { fontSize: 16, fontFamily: "Inter_700Bold" },
  syndicateName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  syndicateMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  syndicateRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  syndicateRight: { alignItems: "center", gap: 4 },
  statusLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  synDetailCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sep: { height: 1, marginHorizontal: 14 },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  detailLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  synActions: { gap: 10 },
  synAction: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  synActionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

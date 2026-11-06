import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useCallback } from "react";
import {
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Modal from "@/components/ui/AppModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData, type Member, type Syndicate } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import FilterTabs from "@/components/FilterTabs";
import EmptyState from "@/components/EmptyState";
import { Avatar, Button, Card, IconButton, ListItem, PageHeader, SearchField, SheetHeader, StatusBadge, type StatusTone } from "@/components/ui";
import TextField from "@/components/ui/TextField";
import { TYPE } from "@/constants/typography";
import { useToast } from "@/context/ToastContext";
import { chat as chatApi } from "@/features/chat/api";
import { apiRequest } from "@/lib/api";
import { localDate } from "@/lib/localDate";

type MemberFilter = "all" | "active" | "inactive" | "pending";

function readableDate(value: string, lang: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(lang === "ar" ? "ar-MA" : lang, { day: "numeric", month: "long", year: "numeric" });
}

export default function MembersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, isRTL, lang } = useLanguage();
  const { members, syndicates, addMember, addSyndicate, updateSyndicateStatus, updateMemberStatus } = useData();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newProfession, setNewProfession] = useState("");
  // Co-owners need an app account to see their charges and pay: invite by
  // default; the syndic can opt out (e.g. owner without email access).
  const [inviteToApp, setInviteToApp] = useState(true);

  const [submittingMember, setSubmittingMember] = useState(false);
  const [submittingSyndicate, setSubmittingSyndicate] = useState(false);

  // Super admin - add syndicate state
  const [showAddSyndicate, setShowAddSyndicate] = useState(false);
  const [synName, setSynName] = useState("");
  const [synSector, setSynSector] = useState("");
  const [synRegion, setSynRegion] = useState("");
  const [synAdmin, setSynAdmin] = useState("");
  const [selectedSyndicate, setSelectedSyndicate] = useState<Syndicate | null>(null);
  const [suspendReason, setSuspendReason] = useState<string | null>(null);
  const [syndicateModalView, setSyndicateModalView] = useState<"detail" | "members">("detail");
  const [contactingAdmin, setContactingAdmin] = useState(false);

  const closeSyndicateModal = () => {
    setSuspendReason(null);
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
      const res = await apiRequest<{ data: any; invited?: boolean; invitationEmail?: "sent" | "not_sent" }>("/members", "POST", {
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        profession: newProfession.trim() || "Non spécifié",
        joinDate: localDate(),
        inviteToApp: inviteToApp && !!newEmail.trim(),
      });
      const data = res.data;
      const member: Member = {
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone ?? "",
        profession: data.profession ?? "Non spécifié",
        joinDate: data.joinDate ?? localDate(),
        status: data.status ?? "pending",
        cotisationStatus: data.cotisationStatus ?? "pending",
        syndicate: user?.syndicate ?? "",
      };
      addMember(member);
      setShowAdd(false);
      setNewName(""); setNewEmail(""); setNewPhone(""); setNewProfession(""); setInviteToApp(true);
      if (res.invited && res.invitationEmail === "not_sent") {
        // Member and account saved, but the invitation e-mail did not leave.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        showToast({ type: "warning", title: t("inviteEmailNotSentTitle"), message: `${member.name} — ${t("inviteEmailNotSentMessage")}` });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast({
          type: "success",
          title: t("success"),
          message: res.invited ? `${member.name} — ${t("memberInvitedMessage")}` : `${member.name} — ${t("memberAdded") ?? "ajouté"}`,
        });
      }
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
        createdAt: data.createdAt ?? localDate(),
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

  const memberTone = (status: Member["status"]): { tone: StatusTone; label: string } =>
    ({
      active: { tone: "success" as const, label: t("statusActive") },
      inactive: { tone: "neutral" as const, label: t("statusInactive") },
      pending: { tone: "warning" as const, label: t("statusPending") },
    })[status];

  const cotTone = (status: Member["cotisationStatus"]): { tone: StatusTone; label: string } =>
    ({
      paid: { tone: "success" as const, label: t("paid") },
      pending: { tone: "warning" as const, label: t("statusPending") },
      overdue: { tone: "danger" as const, label: t("latePayment") },
    })[status];

  const listBottom = isWide ? 32 : insets.bottom + 104;

  // Super Admin view
  if (isSuperAdmin) {
    const activeSyndicates = syndicates.filter((s) => s.status === "active").length;
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <PageHeader
          title={t("syndicatsTitle")}
          subtitle={t("uiSyndicatesCount").replace("{n}", String(syndicates.length)).replace("{a}", String(activeSyndicates))}
          actions={
            <>
              <IconButton icon="search" accessibilityLabel={t("uiSearch")} onPress={() => router.push("/search" as any)} />
              <Button label={t("uiAdd")} icon="plus" size="sm" onPress={() => setShowAddSyndicate(true)} style={styles.headerCta} />
            </>
          }
        />

        <FlatList
          data={syndicates}
          keyExtractor={(s) => s.id}
          contentContainerStyle={syndicates.length === 0 ? { flexGrow: 1 } : { paddingHorizontal: 16, paddingBottom: listBottom }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon="briefcase" title={t("syndicatsTitle")} description={t("noResults")} />}
          renderItem={({ item: s, index }) => (
            <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }, index === 0 && styles.first, index === syndicates.length - 1 && styles.last]}>
              <ListItem
                leading={<Avatar name={s.name} size={44} />}
                title={s.name}
                subtitle={`${s.sector} · ${s.region}`}
                meta={`${s.members} ${t("syndicatMembersCount").toLowerCase()} · ${t("syndicatAdminLabel")}: ${s.admin || "—"}`}
                trailing={<StatusBadge label={s.status === "active" ? t("statusActive") : t("statusInactive")} tone={s.status === "active" ? "success" : "neutral"} />}
                onPress={() => setSelectedSyndicate(s)}
                divider={index < syndicates.length - 1}
              />
            </View>
          )}
        />

        {/* Syndicate detail / members sheet */}
        <Modal visible={!!selectedSyndicate} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSyndicateModal}>
          {selectedSyndicate && syndicateModalView === "detail" ? (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <SheetHeader title={selectedSyndicate.name} onClose={closeSyndicateModal} />
              <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
                <Card padding="none">
                  {[
                    { label: t("syndicatSector"), value: selectedSyndicate.sector },
                    { label: t("syndicatRegion"), value: selectedSyndicate.region },
                    { label: t("syndicatAdminLabel"), value: selectedSyndicate.admin || "—" },
                    { label: t("syndicatMembersCount"), value: `${selectedSyndicate.members}` },
                    { label: t("syndicatCreatedAt"), value: readableDate(selectedSyndicate.createdAt, lang) },
                  ].map((item, i) => (
                    <View key={item.label} style={[styles.detailRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{item.label}</Text>
                      <Text style={[TYPE.bodyStrong, styles.detailValue, { color: colors.foreground }]}>{item.value}</Text>
                    </View>
                  ))}
                  <View style={[styles.detailRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("syndicatStatusLabel")}</Text>
                    <StatusBadge label={selectedSyndicate.status === "active" ? t("statusActive") : t("statusInactive")} tone={selectedSyndicate.status === "active" ? "success" : "neutral"} />
                  </View>
                </Card>
                <View style={{ gap: 10 }}>
                  <Button label={t("viewMembersLabel")} icon="users" variant="secondary" fullWidth onPress={() => setSyndicateModalView("members")} />
                  <Button
                    label={contactingAdmin ? t("openingLabel") : t("contactAdminLabel")}
                    icon="message-circle"
                    variant="secondary"
                    fullWidth
                    loading={contactingAdmin}
                    onPress={() => handleContactAdmin(selectedSyndicate)}
                  />
                  <Button label={t("tableauNationalLabel")} icon="globe" variant="secondary" fullWidth onPress={() => navigateFromSyndicateModal("/tableau-national")} />
                  {suspendReason !== null ? (
                    <TextField label={t("syndicateSuspendReason")} value={suspendReason} onChangeText={setSuspendReason} multiline maxLength={500} />
                  ) : null}
                  <Button
                    label={selectedSyndicate.status === "active" ? t("deactivate") : t("activate")}
                    icon={selectedSyndicate.status === "active" ? "user-x" : "user-check"}
                    variant={selectedSyndicate.status === "active" ? "destructive" : "primary"}
                    fullWidth
                    onPress={() => {
                      const newStatus = selectedSyndicate.status === "active" ? ("inactive" as const) : ("active" as const);
                      const label = newStatus === "active" ? t("activate") : t("deactivate");
                      // The server requires a reason to suspend a condominium.
                      if (newStatus === "inactive" && suspendReason === null) return setSuspendReason("");
                      if (newStatus === "inactive" && (suspendReason ?? "").trim().length < 3) {
                        return showToast({ type: "error", title: t("error"), message: t("syndicateSuspendReason") });
                      }
                      const reason = newStatus === "inactive" ? suspendReason!.trim() : undefined;
                      Alert.alert(label, `${selectedSyndicate.name}?`, [
                        { text: t("cancel"), style: "cancel" },
                        {
                          text: label,
                          style: newStatus === "active" ? "default" : "destructive",
                          onPress: async () => {
                            if (!(await updateSyndicateStatus(selectedSyndicate.id, newStatus, reason))) return;
                            setSuspendReason(null);
                            setSelectedSyndicate({ ...selectedSyndicate, status: newStatus });
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                            showToast({ type: "success", title: t("success"), message: selectedSyndicate.name });
                          },
                        },
                      ]);
                    }}
                  />
                </View>
              </ScrollView>
            </View>
          ) : selectedSyndicate && syndicateModalView === "members" ? (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <SheetHeader
                title={t("syndicatMembersCount")}
                subtitle={selectedSyndicate.name}
                onBack={() => setSyndicateModalView("detail")}
                onClose={closeSyndicateModal}
              />
              {(() => {
                // Members of this syndicate only — never another syndicate's
                // members as a fallback.
                const synMembers = members.filter(
                  (m) =>
                    m.syndicate === selectedSyndicate.id ||
                    m.syndicate.toLowerCase() === selectedSyndicate.name.toLowerCase(),
                );
                return (
                  <FlatList
                    data={synMembers}
                    keyExtractor={(m) => m.id}
                    contentContainerStyle={synMembers.length === 0 ? { flexGrow: 1 } : { padding: 16, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={<EmptyState icon="users" title={t("uiNoMembersInSyndicate")} />}
                    ListHeaderComponent={
                      synMembers.length ? (
                        <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: 8 }]}>
                          {synMembers.length} {t("membersInSyndicate")}
                        </Text>
                      ) : undefined
                    }
                    renderItem={({ item: m, index }) => {
                      const sc = memberTone(m.status);
                      return (
                        <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }, index === 0 && styles.first, index === synMembers.length - 1 && styles.last]}>
                          <ListItem
                            leading={<Avatar name={m.name} size={40} />}
                            title={m.name}
                            subtitle={m.profession}
                            trailing={<StatusBadge label={sc.label} tone={sc.tone} />}
                            onPress={() => navigateFromSyndicateModal(`/member-detail?id=${m.id}`)}
                            divider={index < synMembers.length - 1}
                          />
                        </View>
                      );
                    }}
                  />
                );
              })()}
            </View>
          ) : null}
        </Modal>

        {/* Add syndicate sheet */}
        <Modal visible={showAddSyndicate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddSyndicate(false)}>
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <SheetHeader title={t("newSyndicate")} onClose={() => setShowAddSyndicate(false)} />
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <TextField label={t("nomSyndicat")} required value={synName} onChangeText={setSynName} placeholder={t("synNamePlaceholder")} />
              <TextField label={t("syndicatSector")} value={synSector} onChangeText={setSynSector} placeholder={t("synSectorPlaceholder")} />
              <TextField label={t("syndicatRegion")} value={synRegion} onChangeText={setSynRegion} placeholder={t("synRegionPlaceholder")} />
              <TextField label={t("syndicatAdminLabel")} value={synAdmin} onChangeText={setSynAdmin} />
              <Button label={t("createSyndicatBtn")} size="lg" fullWidth disabled={!synName.trim()} loading={submittingSyndicate} onPress={handleAddSyndicate} />
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  // Syndicate admin view
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <PageHeader
        title={t("copropriétairesTitle")}
        subtitle={t("uiMembersCount").replace("{n}", String(filtered.length)).replace("{total}", String(members.length))}
        actions={<Button label={t("uiAdd")} icon="plus" size="sm" onPress={() => setShowAdd(true)} style={styles.headerCta} />}
      >
        <SearchField value={search} onChangeText={setSearch} placeholder={t("searchMemberPlaceholder")} />
      </PageHeader>

      <FilterTabs
        options={FILTERS.map((f) => ({ ...f, count: f.key === "pending" ? members.filter((m) => m.status === "pending").length : undefined }))}
        value={filter}
        onChange={(k) => setFilter(k as MemberFilter)}
      />

      <FlatList
        data={filtered}
        keyExtractor={(m) => m.id}
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : { padding: 16, paddingTop: 8, gap: 10, paddingBottom: listBottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          members.length === 0 ? (
            <EmptyState icon="users" title={t("noMembers")} actionLabel={t("addMember")} onAction={() => setShowAdd(true)} />
          ) : (
            <EmptyState icon="search" title={t("uiNoMatch")} description={t("uiNoMatchDesc")} />
          )
        }
        renderItem={({ item: m }) => {
          const sc = memberTone(m.status);
          const cc = cotTone(m.cotisationStatus);
          const isPending = m.status === "pending";
          return (
            <View style={[styles.memberCard, { backgroundColor: colors.card, borderColor: isPending ? colors.warning + "66" : colors.border }]}>
              <ListItem
                leading={<Avatar name={m.name} size={44} />}
                title={m.name}
                subtitle={m.profession}
                meta={m.joinDate ? t("uiJoined").replace("{d}", m.joinDate.slice(0, 7)) : undefined}
                trailing={
                  <View style={styles.badges}>
                    <StatusBadge label={sc.label} tone={sc.tone} />
                    {!isPending ? <StatusBadge label={cc.label} tone={cc.tone} icon="credit-card" /> : null}
                  </View>
                }
                onPress={() => router.push({ pathname: "/member-detail", params: { id: m.id } })}
              />
              {isPending ? (
                <View style={[styles.pendingActions, { borderTopColor: colors.border }]}>
                  <Button
                    label={t("rejectBtn")}
                    icon="x"
                    variant="secondary"
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => {
                      Alert.alert(t("rejectRequestLabel"), `${m.name}?`, [
                        { text: t("cancel"), style: "cancel" },
                        {
                          text: t("rejectBtn"),
                          style: "destructive",
                          onPress: async () => {
                            if (!(await updateMemberStatus(m.id, "inactive"))) return;
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                          },
                        },
                      ]);
                    }}
                  />
                  <Button
                    label={t("approveRequest")}
                    icon="check"
                    size="sm"
                    style={{ flex: 2 }}
                    onPress={async () => {
                      if (!(await updateMemberStatus(m.id, "active"))) return;
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    }}
                  />
                </View>
              ) : null}
            </View>
          );
        }}
      />

      {/* Add member sheet */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <SheetHeader title={t("addMember")} onClose={() => setShowAdd(false)} />
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <TextField label={t("nomComplet")} required value={newName} onChangeText={setNewName} placeholder="Mohammed Alaoui" autoCapitalize="words" />
            <TextField label={t("email")} value={newEmail} onChangeText={setNewEmail} placeholder="email@exemple.com" keyboardType="email-address" autoCapitalize="none" />
            <TextField label={t("phone")} value={newPhone} onChangeText={setNewPhone} placeholder="+212 6 XX XX XX XX" keyboardType="phone-pad" />
            <TextField label={t("professionLabel")} value={newProfession} onChangeText={setNewProfession} />
            <View style={[styles.inviteRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{t("inviteToAppLabel")}</Text>
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("inviteToAppSub")}</Text>
              </View>
              <Switch
                value={inviteToApp}
                onValueChange={setInviteToApp}
                trackColor={{ true: colors.primary, false: colors.border }}
                accessibilityLabel={t("inviteToAppLabel")}
              />
            </View>
            <Button label={t("saveMemberBtn")} size="lg" fullWidth disabled={!newName.trim()} loading={submittingMember} onPress={handleAdd} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  modal: { flex: 1 },
  headerCta: { minHeight: 44 },
  rowCard: { borderLeftWidth: 1, borderRightWidth: 1 },
  first: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden", marginTop: 4 },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: "hidden" },
  memberCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  badges: { alignItems: "flex-end", gap: 6 },
  pendingActions: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  detailValue: { flexShrink: 1, textAlign: "right" },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
});

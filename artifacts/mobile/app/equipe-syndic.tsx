import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Linking, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  committeeRole?: string | null;
  joinDate?: string | null;
  type: "admin" | "committee";
};

type SyndicateContact = {
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  officeHours?: string | null;
};

export default function EquipeSyndicScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const { t } = useLanguage();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "super_admin";
  const { showToast } = useToast();

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [syndicate, setSyndicate] = useState<SyndicateContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ phone: "", email: "", address: "", website: "", officeHours: "" });
  const [submitting, setSubmitting] = useState(false);

  const ROLE_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
    super_admin:      { label: t("teamSuperAdmin"),     color: "#2563EB", icon: "shield" },
    syndicate_admin:  { label: t("teamSyndicAdmin"),    color: "#3b82f6", icon: "briefcase" },
    president:        { label: t("teamPresidentRole"),  color: "#f59e0b", icon: "award" },
    tresorier:        { label: t("teamTresorierRole"),  color: "#10b981", icon: "dollar-sign" },
    secretaire:       { label: t("teamSecretaireRole"), color: "#ec4899", icon: "edit-3" },
    member:           { label: t("teamCopropriétaire"), color: "#6b7280", icon: "user" },
    committee_member: { label: t("roleMembreConseil"),  color: "#8b5cf6", icon: "layers" },
  };

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(false); }
      const data = await apiRequest("/team", "GET", undefined, token);
      setTeam(data.data ?? []);
      setSyndicate(data.syndicate ?? null);
    } catch {
      if (!silent) setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const openEditSyndicate = () => {
    setEditForm({
      phone: syndicate?.phone ?? "",
      email: syndicate?.email ?? "",
      address: syndicate?.address ?? "",
      website: syndicate?.website ?? "",
      officeHours: (syndicate as any)?.officeHours ?? "",
    });
    setShowEdit(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveSyndicate = async () => {
    try {
      setSubmitting(true);
      await apiRequest("/team/syndicate", "PUT", editForm, token);
      setShowEdit(false);
      showToast({ type: "success", message: t("teamCoordsUpdated") });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: e.message ?? t("teamCoordsError") });
    } finally {
      setSubmitting(false);
    }
  };

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() =>
      showToast({ type: "error", title: t("error"), message: t("cannotOpenPhone") })
    );
  };

  const sendEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`).catch(() =>
      showToast({ type: "error", title: t("error"), message: t("cannotOpenEmail") })
    );
  };

  const admins = team.filter((m) => m.type === "admin");
  const committee = team.filter((m) => m.type === "committee");

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: "#3b82f6" }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("teamSyndic")}</Text>
          <Text style={styles.headerSub}>
            {team.length} {t("teamMember")}{team.length !== 1 ? "s" : ""}
          </Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity style={styles.editBtn} onPress={openEditSyndicate}>
            <Feather name="edit-2" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#3b82f6" size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            {t("teamLoadingDesc")}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <View style={[styles.errorIcon, { backgroundColor: "#ef444415" }]}>
            <Feather name="wifi-off" size={32} color="#ef4444" />
          </View>
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>{t("error")}</Text>
          <Text style={[styles.errorDesc, { color: colors.mutedForeground }]}>{t("teamLoadError")}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: "#3b82f6" }]}
            onPress={() => load()}
          >
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.retryText}>{t("retryBtn")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
          showsVerticalScrollIndicator={false}
        >
          {/* Syndicate Contact Card */}
          {syndicate ? (
            <View style={[styles.syndicateCard, { backgroundColor: "#3b82f6" }]}>
              <View style={styles.syndicateCardTop}>
                <View style={[styles.syndicateIcon, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                  <Feather name="home" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.syndicateName}>{syndicate.name}</Text>
                  {syndicate.address ? (
                    <Text style={styles.syndicateAddr}>{syndicate.address}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.contactRow}>
                {syndicate.phone ? (
                  <TouchableOpacity style={styles.contactBtn} onPress={() => callPhone(syndicate.phone!)}>
                    <Feather name="phone" size={14} color="#fff" />
                    <Text style={styles.contactBtnText}>{syndicate.phone}</Text>
                  </TouchableOpacity>
                ) : null}
                {syndicate.email ? (
                  <TouchableOpacity style={styles.contactBtn} onPress={() => sendEmail(syndicate.email!)}>
                    <Feather name="mail" size={14} color="#fff" />
                    <Text style={styles.contactBtnText}>{syndicate.email}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Administration */}
          {admins.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                {t("adminSectionLabel").toUpperCase()}
              </Text>
              {admins.map((m) => (
                <MemberCard
                  key={m.id}
                  member={m}
                  colors={colors}
                  roleConfig={ROLE_CONFIG}
                  onCall={callPhone}
                  onEmail={sendEmail}
                />
              ))}
            </>
          ) : null}

          {/* Conseil Syndical */}
          {committee.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                {t("councilSyndicLabel").toUpperCase()}
              </Text>
              {committee.map((m) => (
                <MemberCard
                  key={m.id}
                  member={m}
                  colors={colors}
                  roleConfig={ROLE_CONFIG}
                  onCall={callPhone}
                  onEmail={sendEmail}
                />
              ))}
            </>
          ) : null}

          {team.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: "#3b82f615" }]}>
                <Feather name="users" size={32} color="#3b82f6" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {t("teamEmptyTitle")}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t("teamEmptyDesc")}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Edit Syndicate Modal */}
      <Modal
        visible={showEdit}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEdit(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t("syndicCoordsTitle")}
            </Text>
            <TouchableOpacity onPress={() => setShowEdit(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {[
              { label: t("phoneLabel"),       key: "phone"       as const, placeholder: "+212 5xx xx xx xx" },
              { label: t("emailLabel"),       key: "email"       as const, placeholder: "contact@syndicat.ma" },
              { label: t("addressLabel"),     key: "address"     as const, placeholder: "Adresse complète" },
              { label: t("websiteLabel"),     key: "website"     as const, placeholder: "https://syndicat.ma" },
              { label: t("officeHoursLabel"), key: "officeHours" as const, placeholder: "Lun-Ven 9h-12h" },
            ].map((f) => (
              <View key={f.key}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
                  ]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={editForm[f.key]}
                  onChangeText={(v) => setEditForm((p) => ({ ...p, [f.key]: v }))}
                  autoCapitalize="none"
                />
              </View>
            ))}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#3b82f6", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleSaveSyndicate}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="check" size={16} color="#fff" />
                  <Text style={styles.submitText}>{t("saveBtn")}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function MemberCard({
  member, colors, roleConfig, onCall, onEmail,
}: {
  member: TeamMember;
  colors: any;
  roleConfig: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }>;
  onCall: (phone: string) => void;
  onEmail: (email: string) => void;
}) {
  const roleCfg =
    roleConfig[member.committeeRole ?? member.role] ??
    roleConfig["member"] ?? { label: member.role, color: "#6b7280", icon: "user" as const };
  const initials = member.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View style={[memberStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[memberStyles.avatar, { backgroundColor: roleCfg.color + "20" }]}>
        <Text style={[memberStyles.initials, { color: roleCfg.color }]}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[memberStyles.name, { color: colors.foreground }]}>{member.name}</Text>
        <View style={[memberStyles.roleBadge, { backgroundColor: roleCfg.color + "18" }]}>
          <Feather name={roleCfg.icon} size={11} color={roleCfg.color} />
          <Text style={[memberStyles.roleText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
        </View>
        {member.email ? (
          <Text style={[memberStyles.contact, { color: colors.mutedForeground }]} numberOfLines={1}>
            {member.email}
          </Text>
        ) : null}
      </View>
      <View style={memberStyles.actions}>
        {member.phone ? (
          <TouchableOpacity
            style={[memberStyles.actionBtn, { backgroundColor: "#10b98118" }]}
            onPress={() => onCall(member.phone!)}
          >
            <Feather name="phone" size={15} color="#10b981" />
          </TouchableOpacity>
        ) : null}
        {member.email ? (
          <TouchableOpacity
            style={[memberStyles.actionBtn, { backgroundColor: "#3b82f618" }]}
            onPress={() => onEmail(member.email)}
          >
            <Feather name="mail" size={15} color="#3b82f6" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  editBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  list: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  errorIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  errorTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  errorDesc: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, marginTop: 4 },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  syndicateCard: { borderRadius: 18, padding: 16, marginBottom: 4, gap: 12 },
  syndicateCardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  syndicateIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  syndicateName: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  syndicateAddr: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  contactRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  contactBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  contactBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#fff" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginTop: 8, marginBottom: 4, paddingHorizontal: 4 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 8, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, padding: 16, marginTop: 16 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});

const memberStyles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  initials: { fontSize: 16, fontFamily: "Inter_700Bold" },
  name: { fontSize: 15, fontFamily: "Inter_700Bold" },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start", marginTop: 4 },
  roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  contact: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  actions: { flexDirection: "column", gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});

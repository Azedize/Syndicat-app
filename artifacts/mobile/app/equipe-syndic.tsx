import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  super_admin:     { label: "Super Admin",      color: "#2563EB", icon: "shield" },
  syndicate_admin: { label: "Syndic",           color: "#3b82f6", icon: "briefcase" },
  president:       { label: "Président",        color: "#f59e0b", icon: "award" },
  tresorier:       { label: "Trésorier",        color: "#10b981", icon: "dollar-sign" },
  secretaire:      { label: "Secrétaire",       color: "#ec4899", icon: "edit-3" },
  member:          { label: "Copropriétaire",   color: "#6b7280", icon: "user" },
};

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
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const isAdmin = user?.role === "syndicate_admin" || user?.role === "super_admin";
  const { showToast } = useToast();

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [syndicate, setSyndicate] = useState<SyndicateContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ phone: "", email: "", address: "", website: "", officeHours: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest("/team", "GET", undefined, token);
      setTeam(data.data ?? []);
      setSyndicate(data.syndicate ?? null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
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
      showToast({ type: "success", message: "Coordonnées du syndicat mises à jour." });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible de mettre à jour" });
    } finally { setSubmitting(false); }
  };

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => showToast({ type: "error", title: "Erreur", message: "Impossible d'ouvrir l'application téléphone" }));
  };

  const sendEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`).catch(() => showToast({ type: "error", title: "Erreur", message: "Impossible d'ouvrir l'application email" }));
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
          <Text style={styles.headerTitle}>Équipe du Syndicat</Text>
          <Text style={styles.headerSub}>{team.length} membre{team.length !== 1 ? "s" : ""} de l'équipe de direction</Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity style={styles.editBtn} onPress={openEditSyndicate}>
            <Feather name="edit-2" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#3b82f6" size="large" /></View>
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
                  {syndicate.address ? <Text style={styles.syndicateAddr}>{syndicate.address}</Text> : null}
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

          {/* Administration section */}
          {admins.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Administration</Text>
              {admins.map((m) => <MemberCard key={m.id} member={m} colors={colors} onCall={callPhone} onEmail={sendEmail} />)}
            </>
          ) : null}

          {/* Conseil syndical section */}
          {committee.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Conseil Syndical</Text>
              {committee.map((m) => <MemberCard key={m.id} member={m} colors={colors} onCall={callPhone} onEmail={sendEmail} />)}
            </>
          ) : null}

          {team.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: "#3b82f615" }]}>
                <Feather name="users" size={32} color="#3b82f6" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun membre trouvé</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>L'équipe de direction apparaîtra ici une fois configurée.</Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Edit Syndicate Modal */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEdit(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Coordonnées du Syndicat</Text>
            <TouchableOpacity onPress={() => setShowEdit(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {[
              { label: "Téléphone", key: "phone" as const, placeholder: "+212 5xx xx xx xx" },
              { label: "Email", key: "email" as const, placeholder: "contact@syndicat.ma" },
              { label: "Adresse", key: "address" as const, placeholder: "Adresse complète" },
              { label: "Site web", key: "website" as const, placeholder: "https://syndicat.ma" },
              { label: "Horaires d'accueil", key: "officeHours" as const, placeholder: "Lun-Ven 9h-12h" },
            ].map((f) => (
              <View key={f.key}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={editForm[f.key]}
                  onChangeText={(v) => setEditForm((p) => ({ ...p, [f.key]: v }))}
                />
              </View>
            ))}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#3b82f6", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleSaveSyndicate} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Enregistrer</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function MemberCard({ member, colors, onCall, onEmail }: {
  member: TeamMember;
  colors: any;
  onCall: (phone: string) => void;
  onEmail: (email: string) => void;
}) {
  const roleCfg = ROLE_CONFIG[member.committeeRole ?? member.role] ?? ROLE_CONFIG.member;
  const initials = member.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

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
        {member.email ? <Text style={[memberStyles.contact, { color: colors.mutedForeground }]} numberOfLines={1}>{member.email}</Text> : null}
      </View>
      <View style={memberStyles.actions}>
        {member.phone ? (
          <TouchableOpacity style={[memberStyles.actionBtn, { backgroundColor: "#10b98118" }]} onPress={() => onCall(member.phone!)}>
            <Feather name="phone" size={15} color="#10b981" />
          </TouchableOpacity>
        ) : null}
        {member.email ? (
          <TouchableOpacity style={[memberStyles.actionBtn, { backgroundColor: "#3b82f618" }]} onPress={() => onEmail(member.email)}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  syndicateCard: { borderRadius: 18, padding: 16, marginBottom: 4, gap: 12 },
  syndicateCardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  syndicateIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  syndicateName: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  syndicateAddr: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  contactRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  contactBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  contactBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#fff" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8, marginBottom: 4, paddingHorizontal: 4 },
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
  submitBtn: { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 16 },
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

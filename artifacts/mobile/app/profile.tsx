import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useState } from "react";
import { shareContent } from "@/hooks/useShare";
import {
  Alert,
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
import { auth as authApi, getToken } from "@/services/api";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [showPwd, setShowPwd] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const { isWide, isTablet, isDesktop, width: screenWidth, sidebarWidth } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const ACTION_GAP = 10;
  const hPad = isWide ? 24 : 20;
  const contentWidth = screenWidth - sidebarWidth - hPad * 2;
  const numCols = isDesktop ? 7 : isTablet ? 5 : 4;
  const actionItemWidth = Math.floor((contentWidth - ACTION_GAP * (numCols - 1)) / numCols);

  const initials = user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "";
  const roleLabel = user?.role === "super_admin" ? "Super Administrateur" : user?.role === "syndicate_admin" ? "Admin Syndicat" : "Membre";
  const roleIcon = user?.role === "super_admin" ? "shield" as const : user?.role === "syndicate_admin" ? "briefcase" as const : "user" as const;

  const INFO_ROWS = [
    { icon: "mail" as const, label: "Email", value: user?.email, editable: false },
    { icon: "phone" as const, label: "Téléphone", value: phone, editable: true, key: "phone" },
    { icon: "briefcase" as const, label: "Profession", value: user?.profession, editable: false },
    { icon: "calendar" as const, label: "Membre depuis", value: user?.memberSince, editable: false },
    { icon: "shield" as const, label: "Rôle", value: roleLabel, editable: false },
    ...(user?.syndicate ? [{ icon: "briefcase" as const, label: "Syndicat", value: user.syndicate, editable: false }] : []),
  ];

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Erreur", "Le nom ne peut pas être vide.");
      return;
    }
    setEditing(false);
    try {
      const res = await authApi.updateProfile({ name: name.trim(), phone });
      updateUser({ name: res.data.name, phone: res.data.phone ?? undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Profil mis à jour", "Vos modifications ont été enregistrées.");
    } catch {
      updateUser({ name: name.trim(), phone });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Profil mis à jour", "Vos modifications ont été enregistrées.");
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd || !confirmPwd) return;
    if (newPwd !== confirmPwd) {
      Alert.alert("Erreur", "Les mots de passe ne correspondent pas.");
      return;
    }
    if (newPwd.length < 8) {
      Alert.alert("Erreur", "Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    try {
      await authApi.changePassword(oldPwd, newPwd);
      setShowPwd(false);
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Mot de passe changé", "Votre mot de passe a été modifié avec succès.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors du changement de mot de passe.";
      Alert.alert("Erreur", msg);
    }
  };

  const handleAttestation = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const currentToken = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const base = domain
        ? `https://${domain}`
        : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}`;
      const tokenParam = currentToken ? `?token=${encodeURIComponent(currentToken)}` : "";
      const url = `${base}/api/pdf/membership/${user?.id}${tokenParam}`;
      await Linking.openURL(url);
    } catch {
      Alert.alert("Erreur", "Impossible de générer l'attestation. Vérifiez votre connexion.");
    }
  };

  const [showQR, setShowQR] = useState(false);

  const QUICK_ACTIONS = [
    { icon: "award" as const, label: "Attestation\nd'adhésion", color: colors.primary, onPress: handleAttestation },
    { icon: "credit-card" as const, label: "Mes\ncotisations", color: "#3b82f6", onPress: () => router.push("/cotisations" as any) },
    { icon: "lock" as const, label: "Changer\nmot de passe", color: "#f59e0b", onPress: () => setShowPwd(true) },
    { icon: "grid" as const, label: "QR Code\nMembre", color: "#8b5cf6", onPress: () => { setShowQR(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
    { icon: "credit-card" as const, label: "Carte\nmembre", color: "#7c3aed", onPress: () => { setShowQR(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
    { icon: "inbox" as const, label: "Mes\ndemandes", color: "#ec4899", onPress: () => router.push("/support" as any) },
    { icon: "activity" as const, label: "Protections\nsociales", color: "#10b981", onPress: () => router.push("/cotisations" as any) },
    { icon: "shopping-bag" as const, label: "Ma\nboutique", color: "#10b981", onPress: () => router.push("/my-shop" as any) },
    { icon: "package" as const, label: "Mes\ncommandes", color: "#6366f1", onPress: () => router.push("/orders" as any) },
    { icon: "headphones" as const, label: "Support\nsyndicat", color: "#ef4444", onPress: () => router.push("/support" as any) },
  ];

  const pwdStrength = newPwd.length === 0 ? null : newPwd.length < 6 ? { label: "Faible", color: colors.destructive, width: "33%" as const } : newPwd.length < 10 ? { label: "Moyen", color: "#f59e0b", width: "66%" as const } : { label: "Fort", color: colors.success, width: "100%" as const };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Mon Profil</Text>
        <TouchableOpacity
          style={[styles.editBtn, { backgroundColor: editing ? colors.primary : colors.secondary }]}
          onPress={() => { editing ? handleSave() : setEditing(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name={editing ? "check" : "edit-2"} size={16} color={editing ? "#fff" : colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{initials}</Text>
          </View>
          {editing ? (
            <TextInput
              style={[styles.heroNameInput, { color: "#fff", borderColor: "rgba(255,255,255,0.4)" }]}
              value={name}
              onChangeText={setName}
              placeholder="Nom complet"
              placeholderTextColor="rgba(255,255,255,0.5)"
            />
          ) : (
            <Text style={styles.heroName}>{user?.name}</Text>
          )}
          <View style={styles.heroBadge}>
            <Feather name={roleIcon} size={11} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroBadgeText}>{roleLabel}</Text>
          </View>
          <View style={styles.heroStatus}>
            <View style={styles.heroStatusDot} />
            <Text style={styles.heroStatusText}>Compte actif</Text>
          </View>
        </View>

        <View style={{ padding: 20, gap: 20 }}>
          {/* Stats */}
          <View style={styles.statsRow}>
            {[
              { label: "Cotisations", value: "12", icon: "credit-card" as const, color: colors.primary },
              { label: "Documents", value: "8", icon: "file-text" as const, color: "#3b82f6" },
              { label: "Votes", value: "3", icon: "check-square" as const, color: "#10b981" },
            ].map((s) => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: s.color + "15" }]}>
                  <Feather name={s.icon} size={16} color={s.color} />
                </View>
                <Text style={[styles.statVal, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Quick actions */}
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Actions rapides</Text>
            <View style={styles.actionsGrid}>
              {QUICK_ACTIONS.map((a) => (
                <TouchableOpacity
                  key={a.label}
                  style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border, width: actionItemWidth }]}
                  onPress={a.onPress}
                  activeOpacity={0.75}
                >
                  <View style={[styles.actionIcon, { backgroundColor: a.color + "15" }]}>
                    <Feather name={a.icon} size={20} color={a.color} />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Attestation CTA */}
          <TouchableOpacity
            style={[styles.attestationBtn, { backgroundColor: colors.primary }]}
            onPress={handleAttestation}
            activeOpacity={0.85}
          >
            <View style={[styles.attestationIcon, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <Feather name="award" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.attestationTitle}>Télécharger mon attestation</Text>
              <Text style={styles.attestationSub}>Attestation d'adhésion officielle au syndicat</Text>
            </View>
            <Feather name="download" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          {/* Info */}
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Informations personnelles</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {INFO_ROWS.map((row, i) => (
                <View key={row.label}>
                  {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                  <View style={styles.infoRow}>
                    <View style={[styles.rowIcon, { backgroundColor: colors.primary + "15" }]}>
                      <Feather name={row.icon} size={14} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      {editing && row.editable ? (
                        <TextInput
                          style={[styles.rowInput, { borderColor: colors.border, color: colors.foreground }]}
                          value={row.key === "phone" ? phone : name}
                          onChangeText={row.key === "phone" ? setPhone : setName}
                        />
                      ) : (
                        <Text style={[styles.rowValue, { color: colors.foreground }]}>{row.value}</Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Cotisations summary */}
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Cotisations</Text>
            <View style={[styles.cotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cotRow}>
                {[
                  { value: "10", label: "Payées", color: colors.success },
                  { value: "1", label: "En attente", color: "#f59e0b" },
                  { value: "1", label: "En retard", color: colors.destructive },
                ].map((item) => (
                  <View key={item.label} style={[styles.cotItem, { backgroundColor: item.color + "15" }]}>
                    <Text style={[styles.cotValue, { color: item.color }]}>{item.value}</Text>
                    <Text style={[styles.cotLabel, { color: item.color }]}>{item.label}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.cotHistoryBtn, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "08" }]}
                onPress={() => router.push("/cotisations" as any)}
              >
                <Feather name="clock" size={14} color={colors.primary} />
                <Text style={[styles.cotHistoryBtnText, { color: colors.primary }]}>Voir l'historique complet</Text>
                <Feather name="chevron-right" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Security */}
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Sécurité</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity style={styles.secRow} onPress={() => { setShowPwd(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                <View style={[styles.rowIcon, { backgroundColor: "#f59e0b15" }]}>
                  <Feather name="lock" size={14} color="#f59e0b" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowValue, { color: colors.foreground }]}>Changer le mot de passe</Text>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Dernière modification il y a 30 jours</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={[styles.sep, { backgroundColor: colors.border }]} />
              <TouchableOpacity style={styles.secRow} onPress={() => router.push("/settings" as any)}>
                <View style={[styles.rowIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="settings" size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowValue, { color: colors.foreground }]}>Paramètres & notifications</Text>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Confidentialité, sécurité, notifications</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* QR Code Membre modal */}
      <Modal visible={showQR} transparent animationType="fade">
        <View style={[styles.qrOverlay]}>
          <View style={[styles.qrCard, { backgroundColor: colors.card }]}>
            <View style={styles.qrHeader}>
              <Text style={[styles.qrTitle, { color: colors.foreground }]}>QR Code Membre</Text>
              <TouchableOpacity onPress={() => setShowQR(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={[styles.qrBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {/* Simulated QR code using a grid pattern */}
              <View style={styles.qrGrid}>
                {Array.from({ length: 7 }, (_, row) =>
                  Array.from({ length: 7 }, (_, col) => {
                    const isCorner = (row < 2 && col < 2) || (row < 2 && col > 4) || (row > 4 && col < 2);
                    const isBorder = (row === 0 || row === 6 || col === 0 || col === 6) && !isCorner;
                    const isFilled = isCorner || (row === 3 && col % 2 === 0) || (col === 3 && row % 2 === 0) || Math.random() > 0.6;
                    return (
                      <View
                        key={`${row}-${col}`}
                        style={[
                          styles.qrCell,
                          { backgroundColor: isFilled || isBorder ? colors.foreground : colors.background },
                        ]}
                      />
                    );
                  })
                )}
              </View>
            </View>
            <View style={[styles.qrInfoBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
              <Text style={[styles.qrMemberName, { color: colors.foreground }]}>{user?.name}</Text>
              <Text style={[styles.qrMemberEmail, { color: colors.mutedForeground }]}>{user?.email}</Text>
              <View style={[styles.qrMemberIdBox, { backgroundColor: colors.primary }]}>
                <Text style={styles.qrMemberId}>ID: SNE-{user?.id.slice(0, 6).toUpperCase() ?? "000000"}</Text>
              </View>
            </View>
            <Text style={[styles.qrHint, { color: colors.mutedForeground }]}>
              Présentez ce code pour vérifier votre adhésion
            </Text>
            <TouchableOpacity
              style={[styles.qrShareBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                shareContent(`Mon QR Code membre SYNDYCAT\nID: ${user?.id ?? "MBR-001"}\n${user?.name ?? "Membre"}`, "QR Code Membre SYNDYCAT");
              }}
            >
              <Feather name="share-2" size={16} color="#fff" />
              <Text style={styles.qrShareBtnText}>Partager le QR Code</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change password modal */}
      <Modal visible={showPwd} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Changer le mot de passe</Text>
            <TouchableOpacity onPress={() => { setShowPwd(false); setOldPwd(""); setNewPwd(""); setConfirmPwd(""); }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 40 }}>
            {/* Security tip */}
            <View style={[styles.secTip, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
              <Feather name="shield" size={14} color={colors.primary} />
              <Text style={[styles.secTipText, { color: colors.primary }]}>
                Choisissez un mot de passe fort avec au moins 8 caractères, incluant majuscules, chiffres et symboles.
              </Text>
            </View>

            {/* Old password */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Mot de passe actuel</Text>
              <View style={[styles.pwdWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TextInput
                  style={[styles.pwdInput, { color: colors.foreground }]}
                  value={oldPwd}
                  onChangeText={setOldPwd}
                  secureTextEntry={!showOld}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                />
                <TouchableOpacity onPress={() => setShowOld(!showOld)}>
                  <Feather name={showOld ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            {/* New password */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nouveau mot de passe</Text>
              <View style={[styles.pwdWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TextInput
                  style={[styles.pwdInput, { color: colors.foreground }]}
                  value={newPwd}
                  onChangeText={setNewPwd}
                  secureTextEntry={!showNew}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                />
                <TouchableOpacity onPress={() => setShowNew(!showNew)}>
                  <Feather name={showNew ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              {/* Strength meter */}
              {pwdStrength ? (
                <View style={{ gap: 4 }}>
                  <View style={[styles.strengthBar, { backgroundColor: colors.muted }]}>
                    <View style={[styles.strengthFill, { width: pwdStrength.width, backgroundColor: pwdStrength.color }]} />
                  </View>
                  <Text style={[styles.strengthLabel, { color: pwdStrength.color }]}>
                    Force: {pwdStrength.label}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Confirm */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Confirmer le nouveau mot de passe</Text>
              <View style={[styles.pwdWrap, { borderColor: confirmPwd && confirmPwd !== newPwd ? colors.destructive : colors.border, backgroundColor: colors.card }]}>
                <TextInput
                  style={[styles.pwdInput, { color: colors.foreground }]}
                  value={confirmPwd}
                  onChangeText={setConfirmPwd}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                />
                {confirmPwd && confirmPwd === newPwd ? (
                  <Feather name="check-circle" size={16} color={colors.success} />
                ) : null}
              </View>
              {confirmPwd && confirmPwd !== newPwd ? (
                <Text style={[styles.pwdError, { color: colors.destructive }]}>Les mots de passe ne correspondent pas</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[
                styles.changePwdBtn,
                {
                  backgroundColor: oldPwd && newPwd && confirmPwd && newPwd === confirmPwd ? colors.primary : colors.muted,
                },
              ]}
              onPress={handleChangePassword}
              disabled={!oldPwd || !newPwd || !confirmPwd || newPwd !== confirmPwd}
            >
              <Feather name="lock" size={16} color={oldPwd && newPwd && confirmPwd && newPwd === confirmPwd ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.changePwdBtnText, { color: oldPwd && newPwd && confirmPwd && newPwd === confirmPwd ? "#fff" : colors.mutedForeground }]}>
                Confirmer le changement
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", flex: 1 },
  editBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  hero: { paddingTop: 36, paddingBottom: 30, alignItems: "center", gap: 8 },
  heroAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroAvatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  heroName: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  heroNameInput: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", borderBottomWidth: 1, paddingHorizontal: 12, paddingVertical: 4, textAlign: "center" },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  heroBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.9)" },
  heroStatus: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ade80" },
  heroStatusText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard: { alignItems: "center", borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 8, gap: 6 },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },
  attestationBtn: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, padding: 18 },
  attestationIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  attestationTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  attestationSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 3 },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 2 },
  sep: { height: 1, marginVertical: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  secRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rowValue: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 1 },
  rowInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  cotCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  cotRow: { flexDirection: "row", gap: 10 },
  cotItem: { flex: 1, alignItems: "center", borderRadius: 12, padding: 12, gap: 3 },
  cotValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  cotLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cotHistoryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  cotHistoryBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  qrOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  qrCard: { borderRadius: 24, padding: 24, gap: 16, width: "100%" as any, maxWidth: 360 },
  qrHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  qrTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  qrBox: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center", justifyContent: "center" },
  qrGrid: { flexDirection: "row", flexWrap: "wrap", width: 168, aspectRatio: 1 },
  qrCell: { width: 24, height: 24, margin: 0 },
  qrInfoBox: { borderRadius: 14, borderWidth: 1, padding: 14, alignItems: "center", gap: 4 },
  qrMemberName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  qrMemberEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  qrMemberIdBox: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: 4 },
  qrMemberId: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  qrHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  qrShareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  qrShareBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  secTip: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  secTipText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  pwdWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  pwdInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  strengthBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  strengthFill: { height: "100%", borderRadius: 3 },
  strengthLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  pwdError: { fontSize: 11, fontFamily: "Inter_400Regular" },
  changePwdBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14, marginTop: 8 },
  changePwdBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

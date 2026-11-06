import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useState } from "react";
import { shareContent } from "@/hooks/useShare";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Modal from "@/components/ui/AppModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MemberDocumentRequest from "@/features/documents/components/MemberDocumentRequest";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import ScreenHeader from "@/components/ScreenHeader";
import { Avatar, Button, Card, ListItem, SectionHeader, SheetHeader, StatusBadge, TextField, ZelligePattern, toneColors, type StatusTone } from "@/components/ui";
import { FONT, TYPE } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";
import { useMyCharges } from "@/hooks/useMyCharges";
import { auth as authApi, ticketedUrl } from "@/services/api";
import { useFileTicket } from "@/hooks/useFileTicket";
import { pickAndUploadPhoto } from "@/lib/upload";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { useToast } from "@/context/ToastContext";

type FeatherName = keyof typeof Feather.glyphMap;

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateUser, token } = useAuth();
  const isMember = user?.role === "member";
  const myCharges = useMyCharges(isMember);
  const fileTicket = useFileTicket(!!token);
  const { cotisations, transactions, elections } = useData();
  const { t, isRTL } = useLanguage();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profession, setProfession] = useState(user?.profession ?? "");
  const [showPwd, setShowPwd] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});

  // The form opens on what the server last returned (the profile may arrive
  // after the first render), and remembers it to detect unsaved changes.
  const startEdit = () => {
    setName(user?.name ?? "");
    setPhone(user?.phone ?? "");
    setProfession(user?.profession ?? "");
    setFieldErrors({});
    setEditing(true);
  };
  const dirty = editing && (name.trim() !== (user?.name ?? "") || phone.trim() !== (user?.phone ?? "") || profession.trim() !== (user?.profession ?? ""));
  const discard = () => {
    setName(user?.name ?? "");
    setPhone(user?.phone ?? "");
    setProfession(user?.profession ?? "");
    setFieldErrors({});
    setEditing(false);
  };
  const cancelEdit = () => {
    if (!dirty) return discard();
    Alert.alert(t("profileDiscardTitle"), t("profileDiscardMessage"), [
      { text: t("profileKeepEditing"), style: "cancel" },
      { text: t("profileDiscard"), style: "destructive", onPress: discard },
    ]);
  };

  const roleLabel =
    user?.role === "super_admin" ? t("profileRoleSuperAdmin") :
    user?.role === "syndicate_admin" ? t("profileRoleSyndicateAdmin") :
    user?.role === "president" ? t("profileRolePresident") :
    user?.role === "treasurer" ? t("profileRoleTreasurer") :
    user?.role === "secretary" ? t("profileRoleSecretary") :
    user?.role === "committee_member" ? t("profileRoleCommittee") :
    user?.role === "tenant" ? t("profileRoleTenant") :
    t("profileRoleMember");
  const roleIcon: FeatherName = user?.role === "super_admin" ? "shield" : user?.role === "syndicate_admin" ? "briefcase" : "user";
  const avatarUri = resolveAvatarUrl(user?.avatar, fileTicket);

  const handleSave = async () => {
    if (saving) return; // one request at a time (double tap)
    const nextName = name.replace(/\s+/g, " ").trim();
    const nextPhone = phone.trim();
    const errors: { name?: string; phone?: string } = {};
    if (nextName.length < 2) errors.name = t("profileNameRequired");
    // Same rule as the server: Moroccan 05/06/07 numbers or an international +… number.
    if (nextPhone && !/^(\+\d{7,15}|0[5-7]\d{8}|\d{7,15})$/.test(nextPhone.replace(/[\s\-().]/g, ""))) errors.phone = t("profilePhoneInvalid");
    setFieldErrors(errors);
    if (errors.name || errors.phone) return;
    if (!dirty) { setEditing(false); return; }
    setSaving(true);
    try {
      // The form stays open until the server confirms.
      const res = await authApi.updateProfile({ name: nextName, phone: nextPhone, profession: profession.trim() });
      updateUser({ name: res.data.name, phone: res.data.phone ?? undefined, profession: res.data.profession ?? undefined });
      setName(res.data.name ?? nextName);
      setPhone(res.data.phone ?? "");
      setProfession(res.data.profession ?? "");
      setEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("profileTitle"), message: t("profileUpdated") });
    } catch (e: any) {
      // Keep what was typed; show the server's reason on its field.
      const field = e?.body?.field ?? e?.field;
      const msg = typeof e?.message === "string" && e.message ? e.message : t("profileUpdateError");
      if (field === "phone" || field === "name") setFieldErrors({ [field]: msg });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ type: "error", title: t("error"), message: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarPick = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      setAvatarUploading(true);
      const result = await pickAndUploadPhoto();
      if (!result) return;
      const res = await authApi.updateProfile({ avatar: result.objectPath });
      updateUser({ avatar: res.data.avatar ?? undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", message: t("profilePhotoUpdated") });
    } catch {
      showToast({ type: "error", title: t("error"), message: t("profilePhotoUpdateError") });
    } finally {
      setAvatarUploading(false);
    }
  };

  const closePwd = () => {
    setShowPwd(false);
    setOldPwd("");
    setNewPwd("");
    setConfirmPwd("");
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd || !confirmPwd) return;
    if (newPwd !== confirmPwd) {
      showToast({ type: "error", title: t("error"), message: t("profilePasswordsMismatch") });
      return;
    }
    if (newPwd.length < 8) {
      showToast({ type: "error", title: t("error"), message: t("profilePasswordMinLength") });
      return;
    }
    setPwdSaving(true);
    try {
      await authApi.changePassword(oldPwd, newPwd);
      closePwd();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("profilePasswordChanged"), message: t("profilePasswordChangedMessage") });
    } catch {
      showToast({ type: "error", title: t("error"), message: t("profilePasswordChangeError") });
    } finally {
      setPwdSaving(false);
    }
  };

  // Official documents (residence, ownership, payment status) go through the
  // document library: computed by the server from real lots and calls for
  // funds, validated and signed by the syndic, verifiable by QR. The former
  // "membership certificate" cited the trade-union Dahir 1-57-119 and the
  // "member card" QR pointed to a verification page that does not exist.
  const [showDocRequest, setShowDocRequest] = useState(false);
  const canRequestDocument = user?.role === "member" || user?.role === "tenant";

  // One entry per destination (the former grid listed the badge and support twice).
  const QUICK_ACTIONS: { icon: FeatherName; label: string; tone: StatusTone; onPress: () => void }[] = [
    ...(canRequestDocument
      ? [{ icon: "award" as FeatherName, label: t("profileRequestAttestation"), tone: "primary" as StatusTone, onPress: () => setShowDocRequest(true) }]
      : []),
    { icon: "file-text", label: t("profileContributions"), tone: "success", onPress: () => router.push("/charges" as any) },
    { icon: "headphones", label: t("profileSyndicateSupport"), tone: "warning", onPress: () => router.push("/support" as any) },
    { icon: "shopping-bag", label: t("profileMyShop"), tone: "neutral", onPress: () => router.push("/my-shop" as any) },
    { icon: "package", label: t("profileOrders"), tone: "neutral", onPress: () => router.push("/orders" as any) },
  ];

  const INFO_ROWS: { icon: FeatherName; label: string; value?: string; onPress?: () => void; warn?: boolean }[] = [
    {
      icon: "mail",
      label: user?.emailStatus === "undeliverable" ? `${t("profileEmail")} · ${t("emcBannerTitle")}` : t("profileEmail"),
      value: user?.email,
      onPress: () => router.push("/email-change" as any),
      warn: user?.emailStatus === "undeliverable",
    },
    { icon: "phone", label: t("profilePhoneLabel"), value: user?.phone || t("onbPriorityTitle"), onPress: editing ? undefined : startEdit, warn: !user?.phone },
    { icon: "briefcase", label: t("profileProfession"), value: user?.profession, onPress: editing ? undefined : startEdit },
    { icon: "calendar", label: t("profileMemberSince"), value: user?.memberSince },
    ...(user?.syndicate ? [{ icon: "home" as FeatherName, label: t("profileSyndicate"), value: user.syndicate }] : []),
  ];

  const pwdStrength =
    newPwd.length === 0 ? null :
    newPwd.length < 8 ? { label: t("passwordWeak"), color: colors.danger, width: "33%" as const } :
    newPwd.length < 12 ? { label: t("passwordMedium"), color: colors.warning, width: "66%" as const } :
    { label: t("passwordExcellent"), color: colors.success, width: "100%" as const };
  const pwdReady = !!oldPwd && !!newPwd && !!confirmPwd && newPwd === confirmPwd;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader
        title={t("profileTitle")}
        action={{
          icon: editing ? "check" : "edit-2",
          label: editing ? t("save") : t("uiEdit"),
          onPress: () => (editing ? handleSave() : startEdit()),
        }}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.navy }]}>
          <ZelligePattern opacity={0.06} />
          <Pressable
            onPress={editing ? handleAvatarPick : undefined}
            disabled={!editing || avatarUploading}
            accessibilityRole={editing ? "button" : undefined}
            accessibilityLabel={editing ? t("uiChangePhoto") : user?.name}
            style={styles.avatarWrap}
          >
            <View style={[styles.avatarRing, { borderColor: colors.gold }]}>
              <Avatar name={user?.name ?? "?"} uri={avatarUri} size={84} />
            </View>
            {editing ? (
              <View style={[styles.avatarEdit, { backgroundColor: colors.primary, borderColor: colors.navy }]}>
                {avatarUploading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="camera" size={14} color="#fff" />}
              </View>
            ) : null}
          </Pressable>
          {editing ? (
            <View style={[styles.heroField, { backgroundColor: colors.card }]}>
              <TextField label={t("profileFullName")} value={name} onChangeText={setName} autoCapitalize="words" error={fieldErrors.name} editable={!saving} maxLength={100} />
            </View>
          ) : (
            <Text style={[TYPE.headline, styles.heroName]} numberOfLines={2}>
              {user?.name}
            </Text>
          )}
          <View style={[styles.heroPill, { borderColor: "rgba(255,255,255,0.22)" }]}>
            <Feather name={roleIcon} size={12} color={colors.gold} />
            <Text style={[TYPE.caption, { color: "#fff" }]}>{roleLabel}</Text>
          </View>
          {user?.syndicate ? (
            <Text style={[TYPE.secondary, { color: "rgba(255,255,255,0.72)", textAlign: "center" }]} numberOfLines={1}>
              {user.syndicate}
            </Text>
          ) : null}
        </View>

        <View style={styles.body}>
          {/* Activity — real counts from the loaded data */}
          <View style={styles.statsRow}>
            {[
              // Calls for funds settled (server summary) — co-owners only.
              ...(isMember ? [{ label: t("profileStatsCallsPaid"), value: myCharges.data ? `${myCharges.data.paidCount}/${myCharges.data.paidCount + myCharges.data.openCount + myCharges.data.overdueCount}` : "—", icon: "credit-card" as FeatherName, tone: "primary" as StatusTone }] : []),
              { label: t("profileStatsTransactions"), value: transactions.length, icon: "file-text" as FeatherName, tone: "info" as StatusTone },
              { label: t("profileStatsElections"), value: elections.filter((e) => e.status === "open" || e.status === "closed").length, icon: "check-square" as FeatherName, tone: "success" as StatusTone },
            ].map((s) => {
              const tc = toneColors(colors, s.tone);
              return (
                <Card key={s.label} padding="md" style={styles.stat}>
                  <View style={[styles.statIcon, { backgroundColor: tc.bg }]}>
                    <Feather name={s.icon} size={16} color={tc.fg} />
                  </View>
                  <Text style={[TYPE.headline, { color: colors.foreground }]}>{s.value}</Text>
                  <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "center" }]} numberOfLines={2}>
                    {s.label}
                  </Text>
                </Card>
              );
            })}
          </View>

          {/* My calls for funds — only co-owners have a personal account */}
          {isMember ? (
            <View style={styles.group}>
              <SectionHeader title={t("profileContributionsTitle")} actionLabel={t("profileHistory")} onAction={() => router.push("/paiements" as any)} />
              <Card padding="md">
                <View style={styles.statsRow}>
                  {[
                    { value: myCharges.data?.paidCount ?? 0, label: t("profilePaid"), tone: "success" as StatusTone },
                    { value: myCharges.data?.openCount ?? 0, label: t("profilePending"), tone: "warning" as StatusTone },
                    { value: myCharges.data?.overdueCount ?? 0, label: t("profileOverdue"), tone: "danger" as StatusTone },
                  ].map((item) => {
                    const tc = toneColors(colors, item.tone);
                    return (
                      <View key={item.label} style={[styles.cotItem, { backgroundColor: tc.bg }]}>
                        {myCharges.isLoading ? (
                          <ActivityIndicator size="small" color={tc.fg} />
                        ) : (
                          <Text style={[TYPE.headline, { color: tc.text }]}>{item.value}</Text>
                        )}
                        <Text style={[TYPE.caption, { color: tc.text }]}>{item.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </View>
          ) : null}

          {/* Quick actions */}
          <View style={styles.group}>
            <SectionHeader title={t("profileQuickActions")} />
            <View style={styles.grid}>
              {QUICK_ACTIONS.map((a) => {
                const tc = toneColors(colors, a.tone);
                return (
                  <Pressable
                    key={a.label}
                    onPress={a.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={a.label}
                    style={({ pressed }) => [styles.tile, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <View style={[styles.tileIcon, { backgroundColor: tc.bg }]}>
                      <Feather name={a.icon} size={18} color={tc.fg} />
                    </View>
                    <Text style={[TYPE.label, { color: colors.foreground, flex: 1, textAlign: "auto" }]} numberOfLines={2}>
                      {a.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Personal information */}
          <View style={styles.group}>
            <SectionHeader title={t("profilePersonalInfo")} />
            <Card padding="none">
              {INFO_ROWS.map((row) => (
                <ListItem key={row.label} icon={row.icon} iconTone={row.warn ? "warning" : "primary"} title={row.value || "—"} subtitle={row.label} onPress={row.onPress} chevron={!!row.onPress} divider />
              ))}
              {editing ? (
                <View style={{ padding: 16, gap: 12 }}>
                  <TextField label={t("profilePhone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" error={fieldErrors.phone} placeholder="06 XX XX XX XX" editable={!saving} maxLength={30} />
                  <TextField label={t("profileProfession")} value={profession} onChangeText={setProfession} editable={!saving} maxLength={100} />
                </View>
              ) : null}
            </Card>
            {editing ? (
              <View style={styles.editActions}>
                <Button
                  label={t("cancel")}
                  variant="secondary"
                  onPress={cancelEdit}
                  disabled={saving}
                  style={{ flex: 1 }}
                />
                <Button label={t("save")} icon="check" onPress={handleSave} loading={saving} disabled={saving} style={{ flex: 1 }} />
              </View>
            ) : null}
          </View>

          {/* Security */}
          <View style={styles.group}>
            <SectionHeader title={t("profileSecurity")} />
            <Card padding="none">
              <ListItem
                icon="lock"
                iconTone="warning"
                title={t("profilePasswordChange")}
                subtitle={t("profilePasswordTip")}
                onPress={() => {
                  setShowPwd(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                chevron
                divider
              />
              <ListItem icon="settings" iconTone="neutral" title={t("profileSettings")} subtitle={t("profileSettingsDescription")} onPress={() => router.push("/settings" as any)} chevron />
            </Card>
          </View>
        </View>
      </ScrollView>

      {canRequestDocument ? (
        <MemberDocumentRequest
          visible={showDocRequest}
          onClose={() => setShowDocRequest(false)}
          onComplete={() => {
            setShowDocRequest(false);
            showToast({ type: "success", title: t("profileAttestationSentTitle"), message: t("profileAttestationSentMsg") });
          }}
        />
      ) : null}

      {/* Change password */}
      <Modal visible={showPwd} animationType="slide" presentationStyle="pageSheet" onRequestClose={closePwd}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={t("profilePasswordChange")} onClose={closePwd} />
          <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            <View style={[styles.tip, { backgroundColor: colors.infoSoft }]}>
              <Feather name="shield" size={16} color={colors.info} />
              <Text style={[TYPE.secondary, { color: colors.infoText, flex: 1 }]}>{t("profilePasswordTip")}</Text>
            </View>

            <View style={styles.pwdField}>
              <TextField label={t("profileCurrentPassword")} value={oldPwd} onChangeText={setOldPwd} secureTextEntry={!showOld} autoComplete="current-password" autoCapitalize="none" />
              <Pressable onPress={() => setShowOld(!showOld)} style={styles.eye} accessibilityRole="button" accessibilityLabel={t("profileCurrentPassword")} hitSlop={8}>
                <Feather name={showOld ? "eye-off" : "eye"} size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={{ gap: 8 }}>
              <View style={styles.pwdField}>
                <TextField label={t("profileNewPassword")} value={newPwd} onChangeText={setNewPwd} secureTextEntry={!showNew} autoComplete="new-password" autoCapitalize="none" />
                <Pressable onPress={() => setShowNew(!showNew)} style={styles.eye} accessibilityRole="button" accessibilityLabel={t("profileNewPassword")} hitSlop={8}>
                  <Feather name={showNew ? "eye-off" : "eye"} size={18} color={colors.textMuted} />
                </Pressable>
              </View>
              {pwdStrength ? (
                <View style={{ gap: 4 }}>
                  <View style={[styles.strengthBar, { backgroundColor: colors.surfaceMuted }]}>
                    <View style={[styles.strengthFill, { width: pwdStrength.width, backgroundColor: pwdStrength.color }]} />
                  </View>
                  <Text style={[TYPE.caption, { color: pwdStrength.color }]}>
                    {t("profilePasswordStrength")} : {pwdStrength.label}
                  </Text>
                </View>
              ) : null}
            </View>

            <TextField
              label={t("profileConfirmPassword")}
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              secureTextEntry
              autoComplete="new-password"
              autoCapitalize="none"
              error={confirmPwd && confirmPwd !== newPwd ? t("profilePasswordsMismatch") : undefined}
            />

            <Button label={t("profileConfirmChange")} icon="lock" fullWidth size="lg" loading={pwdSaving} disabled={!pwdReady} onPress={handleChangePassword} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { paddingTop: 28, paddingBottom: 28, paddingHorizontal: 20, alignItems: "center", gap: 10, overflow: "hidden" },
  avatarWrap: { marginBottom: 4 },
  avatarRing: { borderWidth: 2, borderRadius: 48, padding: 3 },
  avatarEdit: { position: "absolute", bottom: 0, end: 0, width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  heroName: { color: "#fff", textAlign: "center", fontFamily: FONT.bold },
  heroField: { alignSelf: "stretch", borderRadius: RADIUS.LG, padding: 12 },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.08)" },
  body: { padding: 16, gap: 22 },
  group: { gap: 10 },
  statsRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, alignItems: "center", gap: 6 },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cotItem: { flex: 1, alignItems: "center", borderRadius: RADIUS.MD, paddingVertical: 12, gap: 2, minHeight: 64, justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexBasis: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: RADIUS.LG, paddingVertical: 12, paddingHorizontal: 12, minHeight: 64 },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  editActions: { flexDirection: "row", gap: 10 },
  overlay: { flex: 1, backgroundColor: "rgba(4,10,24,0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  badgeSheet: { width: "100%", maxWidth: 400, maxHeight: "90%", borderRadius: RADIUS.XL, overflow: "hidden" },
  tip: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: RADIUS.MD },
  pwdField: { position: "relative" },
  eye: { position: "absolute", end: 12, bottom: 12 },
  strengthBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  strengthFill: { height: "100%", borderRadius: 3 },
});

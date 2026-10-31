import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "@/components/EmptyState";
import FilterTabs from "@/components/FilterTabs";
import ScreenHeader from "@/components/ScreenHeader";
import { Avatar, Button, Card, ListItem, SheetHeader, StatusBadge, TextField, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { useActivity } from "@/context/ActivityContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { shareContent } from "@/hooks/useShare";
import { apiRequest } from "@/lib/api";

type Tab = "info" | "cotisations";

export default function MemberDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { members, transactions, updateMemberStatus, refreshData } = useData();
  const { logActivity } = useActivity();
  const { showToast } = useToast();

  const member = members.find((m) => m.id === id);
  const memberTx = transactions.filter((tx) => tx.member === member?.name);
  const [tab, setTab] = useState<Tab>("info");

  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({ name: "", email: "", phone: "", profession: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);

  if (!member) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("memberDetail")} />
        <EmptyState icon="user-x" title={t("error")} />
      </View>
    );
  }

  const status: { tone: StatusTone; label: string } =
    member.status === "active"
      ? { tone: "success", label: t("statusActive") }
      : member.status === "pending"
        ? { tone: "warning", label: t("statusPending") }
        : { tone: "neutral", label: t("statusInactive") };
  const cot: { tone: StatusTone; label: string } =
    member.cotisationStatus === "paid"
      ? { tone: "success", label: t("statusPaid") }
      : member.cotisationStatus === "pending"
        ? { tone: "warning", label: t("statusPending") }
        : { tone: "danger", label: t("statusLate") };

  const openEdit = () => {
    setEdit({ name: member.name, email: member.email, phone: member.phone, profession: member.profession });
    setEditError(null);
    setShowEdit(true);
  };

  // Saved through the API (PUT /members/:id); the server decides who may edit.
  const saveEdit = async () => {
    if (saving) return;
    if (!edit.name.trim()) return setEditError(t("uiRequired"));
    if (edit.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(edit.email.trim())) return setEditError(t("uiInvalidEmail"));
    setSaving(true);
    setEditError(null);
    try {
      await apiRequest(`/members/${member.id}`, "PUT", {
        name: edit.name.trim(),
        ...(edit.email.trim() ? { email: edit.email.trim() } : {}),
        phone: edit.phone.trim(),
        profession: edit.profession.trim(),
      });
      setShowEdit(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast({ type: "success", title: t("uiSaved"), message: edit.name.trim() });
      refreshData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t("uiSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = () => {
    Alert.alert(t("statusInactive"), member.name, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("deactivate"),
        style: "destructive",
        onPress: async () => {
          if (!(await updateMemberStatus(member.id, "inactive"))) return;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        },
      },
    ]);
  };

  const contactRows = [
    { icon: "mail" as const, label: t("uiEmail"), value: member.email, open: () => Linking.openURL(`mailto:${member.email}`).catch(() => shareContent(member.email)) },
    { icon: "phone" as const, label: t("phoneLabel"), value: member.phone, open: () => Linking.openURL(`tel:${member.phone}`).catch(() => shareContent(member.phone)) },
    { icon: "briefcase" as const, label: t("uiProfession"), value: member.profession },
    { icon: "users" as const, label: t("uiSyndicate"), value: member.syndicate },
    { icon: "calendar" as const, label: t("joinedOn"), value: member.joinDate },
  ].filter((r) => !!r.value);

  const sheetActions = [
    {
      icon: "folder" as const,
      label: t("documents"),
      run: () => {
        logActivity({ action: t("documents"), target: member.name, route: "/member-detail", icon: "folder", color: colors.tint });
        router.push({ pathname: "/documents", params: { memberId: member.id, memberName: member.name } });
      },
    },
    {
      icon: "award" as const,
      label: t("uiCertificate"),
      run: () => {
        logActivity({ action: "attestation", target: member.name, route: "/documents", icon: "award", color: colors.tint });
        router.push({ pathname: "/documents", params: { templateId: "attestation_adhesion", memberId: member.id } });
      },
    },
    {
      icon: "share-2" as const,
      label: t("share"),
      run: () =>
        shareContent(
          [member.name, member.email, member.phone, member.profession, t("uiMemberSince").replace("{d}", member.joinDate)].filter(Boolean).join("\n"),
          member.name,
        ),
    },
    { icon: "copy" as const, label: t("uiCopyId"), run: () => shareContent(member.id, member.name) },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={member.name}
        subtitle={member.profession}
        action={{ icon: "more-horizontal", label: t("uiMoreActions"), onPress: () => setShowActions(true) }}
        action2={{ icon: "edit-2", label: t("uiEdit"), onPress: openEdit }}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Identity */}
        <View style={[styles.identity, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Avatar name={member.name} size={72} />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Text style={[TYPE.headline, { color: colors.foreground }]} numberOfLines={2}>
              {member.name}
            </Text>
            <View style={styles.badges}>
              <StatusBadge label={status.label} tone={status.tone} size="md" />
              <StatusBadge label={cot.label} tone={cot.tone} icon="credit-card" size="md" />
            </View>
            {member.joinDate ? (
              <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("uiMemberSince").replace("{d}", member.joinDate.slice(0, 7))}</Text>
            ) : null}
          </View>
        </View>

        {/* Primary actions */}
        <View style={styles.actions}>
          <Button label={t("sendMessage")} icon="message-circle" style={{ flex: 1 }} onPress={() => router.push("/chat")} />
          {member.phone ? (
            <Button label={t("uiCall")} icon="phone" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${member.phone}`).catch(() => {})} />
          ) : null}
        </View>

        <FilterTabs
          options={[
            { key: "info", label: t("contactInfo") },
            { key: "cotisations", label: t("paymentHistory"), count: memberTx.length || undefined },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />

        <View style={styles.body}>
          {tab === "info" ? (
            <>
              <Card padding="none">
                {contactRows.map((row, i) => (
                  <ListItem
                    key={row.label}
                    icon={row.icon}
                    title={row.value}
                    subtitle={row.label}
                    onPress={row.open}
                    chevron={!!row.open}
                    divider={i < contactRows.length - 1}
                  />
                ))}
              </Card>

              {member.status !== "active" ? (
                <Button
                  label={t("activate")}
                  icon="user-check"
                  variant="secondary"
                  fullWidth
                  onPress={async () => {
                    if (!(await updateMemberStatus(member.id, "active"))) return;
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  }}
                />
              ) : (
                <Button label={t("deactivate")} icon="user-x" variant="secondary" fullWidth onPress={confirmDeactivate} style={{ borderColor: colors.danger + "55" }} />
              )}
            </>
          ) : memberTx.length === 0 ? (
            <EmptyState icon="credit-card" title={t("noCotisations")} />
          ) : (
            <Card padding="none">
              {memberTx.map((tx, i) => {
                const tone: StatusTone = tx.status === "paid" ? "success" : tx.status === "pending" ? "warning" : "danger";
                const label = tx.status === "paid" ? t("statusPaid") : tx.status === "pending" ? t("statusPending") : t("statusLate");
                return (
                  <ListItem
                    key={tx.id}
                    icon="credit-card"
                    iconTone={tone}
                    title={tx.label}
                    subtitle={tx.date}
                    divider={i < memberTx.length - 1}
                    trailing={
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={[TYPE.amount, { color: colors.foreground }]}>{tx.amount} MAD</Text>
                        <StatusBadge label={label} tone={tone} />
                      </View>
                    }
                  />
                );
              })}
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Edit (saved through the API) */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEdit(false)}>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <SheetHeader title={t("editProfileBtn")} subtitle={member.name} onClose={() => setShowEdit(false)} />
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <TextField label={t("nameLabel")} required value={edit.name} onChangeText={(v) => setEdit((e) => ({ ...e, name: v }))} autoCapitalize="words" />
            <TextField label={t("uiEmail")} value={edit.email} onChangeText={(v) => setEdit((e) => ({ ...e, email: v }))} keyboardType="email-address" autoCapitalize="none" />
            <TextField label={t("phoneLabel")} value={edit.phone} onChangeText={(v) => setEdit((e) => ({ ...e, phone: v }))} keyboardType="phone-pad" />
            <TextField label={t("uiProfession")} value={edit.profession} onChangeText={(v) => setEdit((e) => ({ ...e, profession: v }))} />
            {editError ? (
              <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]} accessibilityLiveRegion="polite">
                <Feather name="alert-circle" size={16} color={colors.danger} />
                <Text style={[TYPE.secondary, { color: colors.dangerText, flex: 1 }]}>{editError}</Text>
              </View>
            ) : null}
            <View style={styles.actionsRow}>
              <Button label={t("cancel")} variant="secondary" style={{ flex: 1 }} onPress={() => setShowEdit(false)} />
              <Button label={t("save")} style={{ flex: 1 }} loading={saving} onPress={saveEdit} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* More actions */}
      <Modal visible={showActions} transparent animationType="fade" onRequestClose={() => setShowActions(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setShowActions(false)} accessibilityLabel={t("close")} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          <Text style={[TYPE.subtitle, { color: colors.foreground, paddingHorizontal: 16, marginBottom: 4 }]} numberOfLines={1}>
            {member.name}
          </Text>
          {sheetActions.map((a, i) => (
            <ListItem
              key={a.label}
              icon={a.icon}
              title={a.label}
              chevron
              divider={i < sheetActions.length - 1}
              onPress={() => {
                setShowActions(false);
                a.run();
              }}
            />
          ))}
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Button label={t("close")} variant="secondary" fullWidth onPress={() => setShowActions(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  identity: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  body: { padding: 16, gap: 16 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  overlay: { flex: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, gap: 4 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
});

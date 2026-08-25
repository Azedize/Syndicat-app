import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { shareContent } from "@/hooks/useShare";
import {
  Alert,
  Linking,
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
import { useActivity } from "@/context/ActivityContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

export default function MemberDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { members, transactions, updateMemberStatus } = useData();
  const { logActivity } = useActivity();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const member = members.find((m) => m.id === id);
  const memberTx = transactions.filter((tx) => tx.member === member?.name);
  const [tab, setTab] = useState<"info" | "cotisations" | "activity">("info");

  // Edit form state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editProfession, setEditProfession] = useState("");

  // Actions modal state
  const [showActions, setShowActions] = useState(false);

  if (!member) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground, padding: 20 }}>{t("error")}</Text>
      </View>
    );
  }

  const statusColor = member.status === "active" ? colors.success : member.status === "pending" ? "#f59e0b" : colors.destructive;
  const statusLabel = member.status === "active" ? t("statusActive") : member.status === "pending" ? t("statusPending") : t("statusInactive");
  const cotColor = member.cotisationStatus === "paid" ? colors.success : member.cotisationStatus === "pending" ? "#f59e0b" : colors.destructive;
  const cotLabel = member.cotisationStatus === "paid" ? t("statusPaid") : member.cotisationStatus === "pending" ? t("statusPending") : t("statusLate");

  const handleActivate = () => {
    updateMemberStatus(member.id, "active");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(t("statusActive"), `${member.name}`);
  };

  const handleDeactivate = () => {
    Alert.alert(t("statusInactive"), `${member.name}`, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("statusInactive"),
        style: "destructive",
        onPress: () => {
          updateMemberStatus(member.id, "inactive");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const initials = member.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.headerAction, { backgroundColor: "rgba(255,255,255,0.2)" }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setEditName(member.name);
            setEditEmail(member.email);
            setEditPhone(member.phone);
            setEditProfession(member.profession);
            setShowEdit(true);
          }}
        >
          <Feather name="edit-2" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerAction, { backgroundColor: "rgba(255,255,255,0.2)" }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowActions(true);
          }}
        >
          <Feather name="more-horizontal" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Profile card */}
      <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: statusColor, borderColor: colors.primary }]} />
        </View>
        <Text style={styles.memberName}>{member.name}</Text>
        <Text style={styles.memberProfession}>{member.profession}</Text>
        <View style={styles.profileBadges}>
          <View style={[styles.badge, { backgroundColor: statusColor + "30" }]}>
            <View style={[styles.badgeDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.badgeText, { color: "#fff" }]}>{statusLabel}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: cotColor + "30" }]}>
            <Feather name="credit-card" size={11} color="#fff" />
            <Text style={[styles.badgeText, { color: "#fff" }]}>{cotLabel}</Text>
          </View>
        </View>
      </View>

      {/* Quick stats */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Syndicat", value: member.syndicate, icon: "briefcase" as const },
          { label: t("joinedOn"), value: member.joinDate.slice(0, 7), icon: "calendar" as const },
          { label: t("cotisationsTitle"), value: `${memberTx.filter((tx) => tx.status === "paid").length}`, icon: "check-circle" as const },
        ].map((stat, i) => (
          <View key={stat.label} style={[styles.statItem, i < 2 ? { borderRightColor: colors.border, borderRightWidth: 1 } : null]}>
            <Feather name={stat.icon} size={14} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]} numberOfLines={1}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {([
          { key: "info", label: t("contactInfo") },
          { key: "cotisations", label: t("paymentHistory") },
          { key: "activity", label: t("activityTitle") },
        ] as { key: typeof tab; label: string }[]).map((tabItem) => (
          <TouchableOpacity
            key={tabItem.key}
            style={[styles.tabBtn, tab === tabItem.key ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : null]}
            onPress={() => setTab(tabItem.key)}
          >
            <Text style={[styles.tabLabel, { color: tab === tabItem.key ? colors.primary : colors.mutedForeground }]}>
              {tabItem.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }}>
        {tab === "info" ? (
          <>
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { icon: "mail" as const, label: "Email", value: member.email },
                { icon: "phone" as const, label: t("phoneLabel"), value: member.phone },
                { icon: "briefcase" as const, label: "Profession", value: member.profession },
                { icon: "users" as const, label: "Syndicat", value: member.syndicate },
                { icon: "calendar" as const, label: t("joinedOn"), value: member.joinDate },
              ].map((item, i) => (
                <View key={item.label}>
                  {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                  <View style={styles.infoRow}>
                    <View style={[styles.infoIcon, { backgroundColor: colors.primary + "12" }]}>
                      <Feather name={item.icon} size={14} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{item.value}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.copyBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (item.icon === "mail") {
                          Linking.openURL(`mailto:${item.value}`).catch(() => shareContent(item.value));
                        } else if (item.icon === "phone") {
                          Linking.openURL(`tel:${item.value}`).catch(() => shareContent(item.value));
                        } else {
                          shareContent(item.value);
                        }
                      }}
                    >
                      <Feather name="copy" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Admin actions */}
            <View style={{ gap: 10 }}>
              <Text style={[styles.actionsTitle, { color: colors.foreground }]}>{t("memberDetail")}</Text>
              <View style={styles.actionsGrid}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push("/chat")}
                >
                  <Feather name="message-circle" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>{t("sendMessage")}</Text>
                </TouchableOpacity>
                {member.status !== "active" ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.success }]}
                    onPress={handleActivate}
                  >
                    <Feather name="user-check" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>{t("statusActive")}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.destructive }]}
                    onPress={handleDeactivate}
                  >
                    <Feather name="user-x" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>{t("statusInactive")}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#f59e0b" }]}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert(t("success"), `${member.name}`);
                  }}
                >
                  <Feather name="file-text" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>{t("download")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#1F5EFF" }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert(t("send"), `${member.name}`);
                  }}
                >
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>{t("send")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : tab === "cotisations" ? (
          <>
            {memberTx.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="credit-card" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noCotisations")}</Text>
              </View>
            ) : (
              memberTx.map((tx) => {
                const sc = tx.status === "paid" ? colors.success : tx.status === "pending" ? "#f59e0b" : colors.destructive;
                const sl = tx.status === "paid" ? t("statusPaid") : tx.status === "pending" ? t("statusPending") : t("statusLate");
                return (
                  <View key={tx.id} style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: sc }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.txLabel, { color: colors.foreground }]}>{tx.label}</Text>
                      <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{tx.date}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 5 }}>
                      <Text style={[styles.txAmount, { color: colors.foreground }]}>{tx.amount} MAD</Text>
                      <View style={[styles.txBadge, { backgroundColor: sc + "15" }]}>
                        <Text style={[styles.txBadgeText, { color: sc }]}>{sl}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        ) : (
          <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { icon: "log-in" as const, label: t("activityTitle"), value: t("today"), color: colors.success },
              { icon: "check-square" as const, label: t("elections"), value: t("electionsTitle"), color: colors.primary },
              { icon: "file-text" as const, label: t("documents"), value: t("documentsTitle"), color: "#f59e0b" },
              { icon: "shopping-bag" as const, label: t("marketplace"), value: t("orders"), color: "#1F5EFF" },
              { icon: "message-circle" as const, label: t("chat"), value: t("chatTitle"), color: "#ec4899" },
            ].map((act, i) => (
              <View key={act.label}>
                {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                <View style={styles.activityRow}>
                  <View style={[styles.actIcon, { backgroundColor: act.color + "15" }]}>
                    <Feather name={act.icon} size={15} color={act.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actLabel, { color: colors.mutedForeground }]}>{act.label}</Text>
                    <Text style={[styles.actValue, { color: colors.foreground }]}>{act.value}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Edit member modal */}
      <Modal visible={showEdit} transparent animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 16 }} />
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>{t("editProfileBtn")}</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
              {[
                { label: t("nameLabel"), value: editName, setter: setEditName, placeholder: t("fullNamePlaceholder") },
                { label: "EMAIL", value: editEmail, setter: setEditEmail, placeholder: t("emailPlaceholder") },
                { label: t("phoneLabel"), value: editPhone, setter: setEditPhone, placeholder: t("phonePlaceholder") },
                { label: "Profession", value: editProfession, setter: setEditProfession, placeholder: "Poste / métier" },
              ].map((f) => (
                <View key={f.label} style={{ gap: 6 }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1 }}>{f.label}</Text>
                  <TextInput
                    style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}
                    value={f.value}
                    onChangeText={f.setter}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              ))}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}
                  onPress={() => setShowEdit(false)}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" }}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setShowEdit(false);
                    Alert.alert(t("profileUpdated"), `${editName || member.name}`);
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>{t("save")}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Actions modal */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity style={styles.actionsOverlay} activeOpacity={1} onPress={() => setShowActions(false)} />
        <View style={[styles.actionsSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.actionsDrag, { backgroundColor: colors.border }]} />
          <Text style={[styles.actionsSheetTitle, { color: colors.foreground }]}>{t("memberDetail")} — {member?.name}</Text>
          {[
            {
              icon: "download" as const,
              label: t("download"),
              color: "#1F5EFF",
              action: () => {
                logActivity({ action: t("download"), target: member?.name ?? "", route: "/member-detail", icon: "download", color: "#1F5EFF" });
                router.push({ pathname: "/documents", params: { memberId: member?.id, memberName: member?.name } });
              },
            },
            {
              icon: "send" as const,
              label: t("send"),
              color: "#3b82f6",
              action: () => {
                const info = `${member?.name}\n${member?.phone ?? ""}\n${member?.profession ?? ""}`;
                logActivity({ action: t("send"), target: member?.name ?? "", route: "/member-detail", icon: "send", color: "#3b82f6" });
                shareContent(info, member?.name);
              },
            },
            {
              icon: "mail" as const,
              label: "Email",
              color: "#10b981",
              action: () => {
                if (member?.email) {
                  Linking.openURL(`mailto:${member.email}`).catch(() =>
                    Alert.alert("Email", member?.email ?? "")
                  );
                }
              },
            },
            {
              icon: "award" as const,
              label: "Attestation",
              color: "#8b5cf6",
              action: () => {
                logActivity({ action: "attestation", target: member?.name ?? "", route: "/documents", icon: "award", color: "#8b5cf6" });
                router.push({ pathname: "/documents", params: { templateId: "attestation_adhesion", memberId: member?.id } });
              },
            },
            {
              icon: "copy" as const,
              label: "Copier ID",
              color: "#f59e0b",
              action: () => {
                shareContent(`ID Membre : ${member?.id ?? ""}`, member?.name);
              },
            },
            {
              icon: "share-2" as const,
              label: t("share"),
              color: "#ec4899",
              action: () => {
                const card =
                  `👤 ${member?.name}\n` +
                  `📧 ${member?.email}\n` +
                  `📞 ${member?.phone ?? "—"}\n` +
                  `💼 ${member?.profession ?? "—"}\n` +
                  `📅 Membre depuis ${member?.joinDate ?? "—"}`;
                shareContent(card, member?.name);
              },
            },
          ].map((item, i) => (
            <TouchableOpacity
              key={item.label + i}
              style={[styles.actionsItem, i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); item.action(); setShowActions(false); }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionsItemIcon, { backgroundColor: item.color + "18" }]}>
                <Feather name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={[styles.actionsItemLabel, { color: colors.foreground }]}>{item.label}</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.actionsCancel, { backgroundColor: colors.destructive + "15" }]}
            onPress={() => setShowActions(false)}
          >
            <Text style={[styles.actionsCancelText, { color: colors.destructive }]}>{t("close")}</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  profileCard: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 4,
    gap: 6,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  statusDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  memberName: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", marginTop: 8 },
  memberProfession: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },
  profileBadges: { flexDirection: "row", gap: 8, marginTop: 4 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  statItem: { flex: 1, alignItems: "center", padding: 14, gap: 4 },
  statValue: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
  },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  copyBtn: { padding: 4 },
  sep: { height: 1, marginHorizontal: 14 },
  actionsTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionBtn: {
    flex: 1,
    minWidth: "45%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 13,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  emptyState: { alignItems: "center", gap: 12, marginTop: 40 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    gap: 12,
  },
  txLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  txDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  txBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  txBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  activityCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  activityRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  actIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  actionsOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  actionsSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 4,
  },
  actionsDrag: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  actionsSheetTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 8 },
  actionsItem: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 },
  actionsItemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionsItemLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  actionsCancel: { marginTop: 8, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  actionsCancelText: { fontSize: 14, fontFamily: "Inter_700Bold" },
});

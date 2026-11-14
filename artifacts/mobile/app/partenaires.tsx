import { Feather } from "@/components/ui/Feather";
import ScreenHeader from "@/components/ScreenHeader";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Modal from "@/components/ui/AppModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData, type Partner } from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import EmptyState from "@/components/EmptyState";
import { ErrorState, LoadingState } from "@/components/DataState";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { localDate } from "@/lib/localDate";

const TYPE_CONFIG: Record<
  Partner["type"],
  { labelKey: string; icon: keyof typeof Feather.glyphMap; color: string }
> = {
  assurance: {
    labelKey: "partnerTypeAssurance",
    icon: "shield",
    color: "#5A4AD6",
  },
  banque: {
    labelKey: "partnerTypeBanque",
    icon: "credit-card",
    color: "#13976C",
  },
  formation: {
    labelKey: "partnerTypeFormation",
    icon: "book-open",
    color: "#C98511",
  },
  sante: { labelKey: "partnerTypeSante", icon: "activity", color: "#C8323C" },
  juridique: {
    labelKey: "partnerTypeJuridique",
    icon: "briefcase",
    color: "#1F8A9A",
  },
  commercial: {
    labelKey: "partnerTypeCommercial",
    icon: "shopping-bag",
    color: "#C98511",
  },
  autre: { labelKey: "partnerTypeOther", icon: "star", color: "#6A6680" },
};

const STATUS_CFG = {
  active: {
    labelKey: "partnerStatusActive",
    color: "#13976C",
    bg: "#13976C18",
  },
  pending: {
    labelKey: "partnerStatusPending",
    color: "#C98511",
    bg: "#C9851118",
  },
  expired: {
    labelKey: "partnerStatusExpired",
    color: "#6A6680",
    bg: "#6A668018",
  },
};

function formatPartnerDate(value: string | undefined, lang: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const locale =
    lang === "ar"
      ? "ar-MA"
      : lang === "es"
        ? "es-ES"
        : lang === "en"
          ? "en-GB"
          : "fr-FR";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** The stored type is free text: an unknown one is shown as « other » instead of crashing the screen. */
const typeConfig = (type: string) => TYPE_CONFIG[type as Partner["type"]] ?? TYPE_CONFIG.autre;

export default function PartenairesScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    partners: storedPartners,
    addPartner,
    updatePartnerStatus,
    dataLoading,
    partnersLoadError,
    refreshData,
  } = useData();
  const { t, lang, isRTL } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  const role = user?.role ?? "member";
  const isAdmin = role === "super_admin" || role === "syndicate_admin";

  const [filterType, setFilterType] = useState<Partner["type"] | "all">("all");
  const [filterStatus, setFilterStatus] = useState<Partner["status"] | "all">(
    "all",
  );
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<Partner["type"]>("assurance");
  const [newContact, setNewContact] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newBenefit, setNewBenefit] = useState("");
  const [newDiscount, setNewDiscount] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // The server stores no status for a partner yet: without one, it follows the
  // end date (expired once passed, active otherwise) instead of breaking the screen.
  const today = new Date().toISOString().slice(0, 10);
  const partners = useMemo(
    () => storedPartners.map((p) => (STATUS_CFG[p.status] ? p : { ...p, status: (p.endDate && p.endDate < today ? "expired" : "active") as Partner["status"] })),
    [storedPartners, today],
  );

  const filtered = partners
    .filter((p) => filterType === "all" || p.type === filterType)
    .filter((p) => filterStatus === "all" || p.status === filterStatus);

  const activeCount = partners.filter((p) => p.status === "active").length;
  const pendingCount = partners.filter((p) => p.status === "pending").length;
  const partnersLoading =
    dataLoading && partners.length === 0 && !partnersLoadError;

  const handleAdd = async () => {
    if (!newName.trim() || !newBenefit.trim()) {
      showToast({ type: "warning", message: t("partnerRequiredFields") });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const saved = await addPartner({
      id: `p${Date.now()}`,
      name: newName.trim(),
      type: newType,
      sector: t(TYPE_CONFIG[newType].labelKey),
      contact: newContact.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim(),
      benefit: newBenefit.trim(),
      discount: newDiscount.trim() || undefined,
      status: "pending",
      startDate: localDate(),
      description: newDescription.trim(),
    });
    if (!saved) {
      showToast({
        type: "error",
        title: t("partnerSaveErrorTitle"),
        message: t("partnerSaveError"),
      });
      return;
    }
    setShowAdd(false);
    setNewName("");
    setNewBenefit("");
    setNewContact("");
    setNewPhone("");
    setNewEmail("");
    setNewDescription("");
    setNewDiscount("");
    showToast({
      type: "success",
      title: t("partnerAddedTitle"),
      message: t("partnerAddedMessage"),
    });
  };

  const handleActivate = async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const updated = await updatePartnerStatus(id, "active");
    if (!updated) {
      showToast({
        type: "error",
        title: t("partnerSaveErrorTitle"),
        message: t("partnerStatusError"),
      });
      return;
    }
    setShowDetail(false);
    showToast({
      type: "success",
      title: t("partnerActivatedTitle"),
      message: t("partnerActivatedMessage"),
    });
  };

  if (partnersLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LoadingState
          title={t("partnerLoadingTitle")}
          description={t("partnerLoadingDescription")}
        />
      </View>
    );
  }

  if (partnersLoadError && partners.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ErrorState
          title={t("partnerLoadErrorTitle")}
          description={t("partnerLoadError")}
          retryLabel={t("partnerRetry")}
          onRetry={refreshData}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t("partenairesTitle")}
        subtitle={`${activeCount} ${t(activeCount === 1 ? "partnerActiveCountOne" : "partnerActiveCount")}`}
        action={isAdmin ? { icon: "plus", label: t("newItem"), onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowAdd(true); } } : undefined}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          gap: 14,
          paddingBottom: isWide ? 32 : insets.bottom + 100,
        }}
      >
        {/* Stats strip */}
        <View
          style={[
            styles.statsRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {[
            {
              label: t("partnerActive"),
              value: activeCount,
              color: colors.success,
              icon: "check-circle" as const,
            },
            {
              label: t("partnerPending"),
              value: pendingCount,
              color: colors.warning,
              icon: "clock" as const,
            },
            {
              label: t("total"),
              value: partners.length,
              color: colors.tint,
              icon: "users" as const,
            },
          ].map((s, i, arr) => (
            <View
              key={s.label}
              style={[
                styles.statCell,
                i < arr.length - 1
                  ? { borderRightWidth: 1, borderRightColor: colors.border }
                  : null,
              ]}
            >
              <View
                style={[styles.statIcon, { backgroundColor: s.color + "18" }]}
              >
                <Feather name={s.icon} size={15} color={s.color} />
              </View>
              <Text style={[styles.statVal, { color: colors.foreground }]}>
                {s.value}
              </Text>
              <Text style={[styles.statLab, { color: colors.mutedForeground }]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -4 }}
          contentContainerStyle={{
            gap: 8,
            paddingHorizontal: 4,
            paddingVertical: 2,
          }}
        >
          {(
            [
              ["all", t("all"), "grid", "#6A6680"],
              ...Object.entries(TYPE_CONFIG).map(([k, v]) => [
                k,
                t(v.labelKey),
                v.icon,
                v.color,
              ]),
            ] as [string, string, keyof typeof Feather.glyphMap, string][]
          ).map(([type, label, icon, color]) => {
            const active = filterType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? color + "20" : colors.card,
                    borderColor: active ? color : colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFilterType(type as any);
                }}
              >
                <Feather
                  name={icon}
                  size={13}
                  color={active ? color : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? color : colors.mutedForeground },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Status filter */}
        <View style={styles.statusFilterRow}>
          {(
            [
              ["all", t("all")],
              ["active", t("partnerActive")],
              ["pending", t("partnerPending")],
              ["expired", t("partnerExpired")],
            ] as [string, string][]
          ).map(([s, l]) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.statusChip,
                {
                  backgroundColor:
                    filterStatus === s ? colors.primary + "15" : colors.card,
                  borderColor:
                    filterStatus === s ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setFilterStatus(s as any);
              }}
            >
              <Text
                style={[
                  styles.statusChipText,
                  {
                    color:
                      filterStatus === s
                        ? colors.primary
                        : colors.mutedForeground,
                  },
                ]}
              >
                {l}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filtered.length === 0 && (
          <EmptyState
            icon="users"
            title={t("partnerEmptyTitle")}
            description={t("partnerEmptyDescription")}
            actionLabel={isAdmin ? t("partnerAddButton") : undefined}
            onAction={isAdmin ? () => setShowAdd(true) : undefined}
          />
        )}

        {/* Partner cards */}
        {filtered.map((partner) => {
          const tc = typeConfig(partner.type);
          const sc = STATUS_CFG[partner.status];
          return (
            <TouchableOpacity
              key={partner.id}
              style={[
                styles.partnerCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedPartner(partner);
                setShowDetail(true);
              }}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.partnerIcon,
                  { backgroundColor: tc.color + "18" },
                ]}
              >
                <Feather name={tc.icon} size={22} color={tc.color} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.partnerTitleRow}>
                  <Text
                    style={[styles.partnerName, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {partner.name}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusPillText, { color: sc.color }]}>
                      {t(sc.labelKey)}
                    </Text>
                  </View>
                </View>
                <View style={styles.partnerTypeRow}>
                  <View
                    style={[
                      styles.typeChip,
                      { backgroundColor: tc.color + "15" },
                    ]}
                  >
                    <Text style={[styles.typeChipText, { color: tc.color }]}>
                      {t(tc.labelKey)}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.partnerBenefit,
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {partner.discount ? `${partner.discount} — ` : ""}
                  {partner.benefit}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Detail modal */}
      <Modal
        visible={showDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetail(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            {selectedPartner && (
              <KeyboardAwareScrollViewCompat bottomOffset={24} showsVerticalScrollIndicator={false}>
                {/* Partner header */}
                <View style={styles.detailHeader}>
                  <View
                    style={[
                      styles.detailIcon,
                      {
                        backgroundColor:
                          typeConfig(selectedPartner.type).color + "18",
                      },
                    ]}
                  >
                    <Feather
                      name={typeConfig(selectedPartner.type).icon}
                      size={28}
                      color={typeConfig(selectedPartner.type).color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.detailName, { color: colors.foreground }]}
                    >
                      {selectedPartner.name}
                    </Text>
                    <View style={styles.detailMetaRow}>
                      <View
                        style={[
                          styles.typeChip,
                          {
                            backgroundColor:
                              typeConfig(selectedPartner.type).color + "15",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            { color: typeConfig(selectedPartner.type).color },
                          ]}
                        >
                          {t(typeConfig(selectedPartner.type).labelKey)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          {
                            backgroundColor:
                              STATUS_CFG[selectedPartner.status].bg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: STATUS_CFG[selectedPartner.status].color },
                          ]}
                        >
                          {t(STATUS_CFG[selectedPartner.status].labelKey)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Benefit banner */}
                {selectedPartner.discount && (
                  <View
                    style={[
                      styles.benefitBanner,
                      {
                        backgroundColor: colors.success + "15",
                        borderColor: colors.success + "30",
                      },
                    ]}
                  >
                    <Feather name="tag" size={16} color={colors.success} />
                    <Text
                      style={[styles.benefitBannerText, { color: colors.success }]}
                    >
                      {selectedPartner.discount}
                    </Text>
                  </View>
                )}

                <Text style={[styles.descText, { color: colors.foreground }]}>
                  {selectedPartner.description}
                </Text>

                <View
                  style={[
                    styles.infoBlock,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {[
                    {
                      icon: "user" as const,
                      label: t("partnerContact"),
                      value: selectedPartner.contact,
                    },
                    {
                      icon: "phone" as const,
                      label: t("phone"),
                      value: selectedPartner.phone,
                    },
                    {
                      icon: "mail" as const,
                      label: t("email"),
                      value: selectedPartner.email,
                    },
                    {
                      icon: "calendar" as const,
                      label: t("partnerStartDate"),
                      value: formatPartnerDate(selectedPartner.startDate, lang),
                    },
                    ...(selectedPartner.endDate
                      ? [
                          {
                            icon: "calendar" as const,
                            label: t("partnerEndDate"),
                            value: formatPartnerDate(
                              selectedPartner.endDate,
                              lang,
                            ),
                          },
                        ]
                      : []),
                  ].map((item, i, arr) => (
                    <View key={item.label}>
                      {i > 0 && (
                        <View
                          style={[
                            styles.infoDivider,
                            { backgroundColor: colors.border },
                          ]}
                        />
                      )}
                      <View style={styles.infoRow}>
                        <Feather
                          name={item.icon}
                          size={14}
                          color={colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.infoLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {item.label}
                        </Text>
                        <Text
                          style={[
                            styles.infoValue,
                            { color: colors.foreground },
                          ]}
                        >
                          {item.value}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {isAdmin && selectedPartner.status === "pending" && (
                  <TouchableOpacity
                    style={[styles.activateBtn, { backgroundColor: colors.success }]}
                    onPress={() => handleActivate(selectedPartner.id)}
                  >
                    <Feather name="check-circle" size={16} color="#fff" />
                    <Text style={styles.activateBtnText}>
                      {t("partnerActivateButton")}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.closeBtn,
                    { backgroundColor: colors.primary, marginTop: 10 },
                  ]}
                  onPress={() => setShowDetail(false)}
                >
                  <Text style={styles.closeBtnText}>{t("close")}</Text>
                </TouchableOpacity>
              </KeyboardAwareScrollViewCompat>
            )}
          </View>
        </View>
      </Modal>

      {/* Add modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t("partnerNewTitle")}
            </Text>

            <KeyboardAwareScrollViewCompat
              showsVerticalScrollIndicator={false}
              style={{ marginTop: 12 }}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              bottomOffset={72}
            >
              {/* Type selector */}
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                {t("partnerTypeLabel")}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 6 }}
              >
                {(
                  Object.entries(TYPE_CONFIG) as [
                    Partner["type"],
                    (typeof TYPE_CONFIG)[Partner["type"]],
                  ][]
                ).map(([type, cfg]) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeOption,
                      {
                        backgroundColor:
                          newType === type
                            ? cfg.color + "20"
                            : colors.background,
                        borderColor:
                          newType === type ? cfg.color : colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setNewType(type);
                    }}
                  >
                    <Feather
                      name={cfg.icon}
                      size={14}
                      color={
                        newType === type ? cfg.color : colors.mutedForeground
                      }
                    />
                    <Text
                      style={[
                        styles.typeOptionText,
                        {
                          color:
                            newType === type
                              ? cfg.color
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      {t(cfg.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {[
                {
                  label: t("partnerNameLabel"),
                  value: newName,
                  setter: setNewName,
                  placeholder: t("partnerNamePlaceholder"),
                },
                {
                  label: t("partnerContactLabel"),
                  value: newContact,
                  setter: setNewContact,
                  placeholder: t("partnerContactPlaceholder"),
                },
                {
                  label: t("partnerPhoneLabel"),
                  value: newPhone,
                  setter: setNewPhone,
                  placeholder: "+212 5 22 ...",
                },
                {
                  label: t("partnerEmailLabel"),
                  value: newEmail,
                  setter: setNewEmail,
                  placeholder: "contact@organisme.ma",
                },
                {
                  label: t("partnerBenefitLabel"),
                  value: newBenefit,
                  setter: setNewBenefit,
                  placeholder: t("partnerBenefitPlaceholder"),
                },
                {
                  label: t("partnerDiscountLabel"),
                  value: newDiscount,
                  setter: setNewDiscount,
                  placeholder: t("partnerDiscountPlaceholder"),
                },
                {
                  label: t("partnerDescriptionLabel"),
                  value: newDescription,
                  setter: setNewDescription,
                  placeholder: t("partnerDescriptionPlaceholder"),
                },
              ].map((f) => (
                <View key={f.label} style={{ gap: 6, marginBottom: 12 }}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {f.label}
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        color: colors.foreground,
                      },
                    ]}
                    value={f.value}
                    onChangeText={f.setter}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    multiline={f.label === "DESCRIPTION"}
                    numberOfLines={f.label === "DESCRIPTION" ? 3 : 1}
                  />
                </View>
              ))}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalCancel, { borderColor: colors.border }]}
                  onPress={() => setShowAdd(false)}
                >
                  <Text
                    style={[
                      styles.modalCancelText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalConfirm,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={handleAdd}
                >
                  <Text style={styles.modalConfirmText}>{t("add")}</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollViewCompat>
          </View>
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontFamily: "Fraunces_600SemiBold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4 },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 10, fontFamily: "Inter_400Regular" },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  filterChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statusFilterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  partnerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  partnerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  partnerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  partnerName: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusPillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  partnerTypeRow: { flexDirection: "row" },
  typeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  partnerBenefit: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "90%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E7E1D6",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  detailIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  detailName: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 6 },
  detailMetaRow: { flexDirection: "row", gap: 8 },
  benefitBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  benefitBannerText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  descText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 16,
  },
  infoBlock: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_500Medium", width: 70 },
  infoValue: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  infoDivider: { height: 1 },
  activateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  activateBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  closeBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  closeBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  fieldLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeOptionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  modalActions: { flexDirection: "row", gap: 10, marginVertical: 16 },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalConfirmText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});

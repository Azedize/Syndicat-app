import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
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
import { apiRequest } from "@/lib/api";
import { getToken } from "@/services/api";
import RoleGuard from "@/components/RoleGuard";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { ErrorState, LoadingState } from "@/components/DataState";

type ActeType =
  | "convocation"
  | "decision"
  | "pv"
  | "proces_verbal_ag"
  | "resolution"
  | "mandat"
  | "attestation"
  | "courrier_officiel";
type ActeStatut = "brouillon" | "valide" | "diffuse" | "archive";

interface ActeAdministratif {
  id: string;
  type: ActeType;
  statut: ActeStatut;
  numero: string;
  titre: string;
  objet: string;
  date: string;
  dateEcheance?: string | null;
  auteur: string;
  signataires: string[];
  destinataires: string[];
  resumeContenu: string | null;
  important: boolean;
  syndicateId?: string | null;
}

const TYPE_CONFIG: Record<
  ActeType,
  { label: string; icon: keyof typeof Feather.glyphMap; color: string }
> = {
  convocation: { label: "Convocation", icon: "mail", color: "#3b82f6" },
  decision: { label: "Décision", icon: "check-square", color: "#10b981" },
  pv: { label: "Procès-verbal", icon: "file-text", color: "#2563EB" },
  proces_verbal_ag: { label: "PV d'AG", icon: "users", color: "#f59e0b" },
  resolution: { label: "Résolution", icon: "clipboard", color: "#6366f1" },
  mandat: { label: "Mandat", icon: "shield", color: "#8b5cf6" },
  attestation: { label: "Attestation", icon: "award", color: "#ec4899" },
  courrier_officiel: {
    label: "Courrier officiel",
    icon: "send",
    color: "#f97316",
  },
};

const STATUT_CONFIG: Record<
  ActeStatut,
  {
    label: string;
    color: string;
    bg: string;
    icon: keyof typeof Feather.glyphMap;
  }
> = {
  brouillon: {
    label: "Brouillon",
    color: "#6b7280",
    bg: "#6b728018",
    icon: "edit-3",
  },
  valide: {
    label: "Validé",
    color: "#10b981",
    bg: "#10b98118",
    icon: "check-circle",
  },
  diffuse: {
    label: "Diffusé",
    color: "#3b82f6",
    bg: "#3b82f618",
    icon: "send",
  },
  archive: {
    label: "Archivé",
    color: "#6b7280",
    bg: "#6b728015",
    icon: "archive",
  },
};

const TYPES_LIST: ActeType[] = [
  "convocation",
  "decision",
  "pv",
  "proces_verbal_ag",
  "resolution",
  "mandat",
  "attestation",
  "courrier_officiel",
];
const STATUTS_LIST: ActeStatut[] = [
  "brouillon",
  "valide",
  "diffuse",
  "archive",
];

export default function ActesAdministratifsScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <ActesAdministratifsScreenInner />
    </RoleGuard>
  );
}

function ActesAdministratifsScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  // Secretary drafts and archives all administrative acts; president signs them.
  // super_admin must not manage individual syndicate administrative documents.
  const isAdmin =
    user?.role === "syndicate_admin" ||
    user?.role === "secretary" ||
    user?.role === "president";

  const [actes, setActes] = useState<ActeAdministratif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatut, setFilterStatut] = useState<ActeStatut | "all">("all");
  const [filterType, setFilterType] = useState<ActeType | "all">("all");
  const [selected, setSelected] = useState<ActeAdministratif | null>(null);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [formType, setFormType] = useState<ActeType>("decision");
  const [formStatut, setFormStatut] = useState<ActeStatut>("brouillon");
  const [formNumero, setFormNumero] = useState("");
  const [formTitre, setFormTitre] = useState("");
  const [formObjet, setFormObjet] = useState("");
  const [formDate, setFormDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [formEcheance, setFormEcheance] = useState("");
  const [formAuteur, setFormAuteur] = useState(user?.name ?? "");
  const [formResume, setFormResume] = useState("");
  const [formImportant, setFormImportant] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchActes = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiRequest<{ data: ActeAdministratif[] }>("/actes");
      setActes(res.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchActes();
  }, [fetchActes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchActes();
  }, [fetchActes]);

  const displayed = actes
    .filter((a) => filterStatut === "all" || a.statut === filterStatut)
    .filter((a) => filterType === "all" || a.type === filterType);

  const openPdf = async (acte: ActeAdministratif) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const currentToken = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const base = domain
        ? `https://${domain}`
        : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}`;
      const tokenParam = currentToken
        ? `?token=${encodeURIComponent(currentToken)}`
        : "";
      const url = `${base}/api/pdf/acte/${acte.id}${tokenParam}`;
      await Linking.openURL(url);
    } catch {
      showToast({
        type: "error",
        title: t("error"),
        message: t("actsPdfError"),
      });
    }
  };

  const handleCreate = async () => {
    if (
      !formNumero.trim() ||
      !formTitre.trim() ||
      !formObjet.trim() ||
      !formDate ||
      !formAuteur.trim()
    ) {
      showToast({
        type: "warning",
        title: t("requiredFields"),
        message: t("actsRequiredFields"),
      });
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiRequest<ActeAdministratif>("/actes", "POST", {
        type: formType,
        statut: formStatut,
        numero: formNumero.trim(),
        titre: formTitre.trim(),
        objet: formObjet.trim(),
        date: formDate,
        dateEcheance: formEcheance.trim() || null,
        auteur: formAuteur.trim(),
        resumeContenu: formResume.trim() || null,
        important: formImportant,
        signataires: [],
        destinataires: [],
      });
      setActes((prev) => [created, ...prev]);
      setCreating(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({
        type: "success",
        title: t("actsCreatedTitle"),
        message: t("actsCreatedMessage").replace("{numero}", created.numero),
      });
    } catch {
      showToast({
        type: "error",
        title: t("error"),
        message: t("actsCreateError"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (
    acte: ActeAdministratif,
    newStatut: ActeStatut,
  ) => {
    try {
      const updated = await apiRequest<ActeAdministratif>(
        `/actes/${acte.id}`,
        "PATCH",
        { statut: newStatut },
      );
      setActes((prev) => prev.map((a) => (a.id === acte.id ? updated : a)));
      setSelected(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showToast({
        type: "error",
        title: t("error"),
        message: t("actsStatusError"),
      });
    }
  };

  const handleDelete = (acte: ActeAdministratif) => {
    Alert.alert(
      t("actsDeleteTitle"),
      t("actsDeleteConfirm").replace("{title}", acte.titre),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest(`/actes/${acte.id}`, "DELETE");
              setActes((prev) => prev.filter((a) => a.id !== acte.id));
              setSelected(null);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              );
            } catch {
              showToast({
                type: "error",
                title: t("error"),
                message: t("actsDeleteError"),
              });
            }
          },
        },
      ],
    );
  };

  const resetForm = () => {
    setFormType("decision");
    setFormStatut("brouillon");
    setFormNumero("");
    setFormTitre("");
    setFormObjet("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormEcheance("");
    setFormAuteur(user?.name ?? "");
    setFormResume("");
    setFormImportant(false);
  };

  const typeLabel = (type: ActeType) =>
    ({
      convocation: t("actsTypeSummons"),
      decision: t("actsTypeDecision"),
      pv: t("actsTypeMinutes"),
      proces_verbal_ag: t("actsTypeAgMinutes"),
      resolution: t("actsTypeResolution"),
      mandat: t("actsTypeMandate"),
      attestation: t("actsTypeCertificate"),
      courrier_officiel: t("actsTypeOfficialLetter"),
    })[type];
  const statusLabel = (status: ActeStatut) =>
    ({
      brouillon: t("actsStatusDraft"),
      valide: t("actsStatusValidated"),
      diffuse: t("actsStatusPublished"),
      archive: t("actsStatusArchived"),
    })[status];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t("actesTitle")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {loading
              ? t("actsLoading")
              : t("actsSummary")
                  .replace("{total}", String(actes.length))
                  .replace(
                    "{drafts}",
                    String(
                      actes.filter((a) => a.statut === "brouillon").length,
                    ),
                  )}
          </Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              resetForm();
              setCreating(true);
            }}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexShrink: 0 }}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[
            styles.chip,
            {
              backgroundColor:
                filterStatut === "all" ? colors.primary : colors.card,
              borderColor:
                filterStatut === "all" ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setFilterStatut("all")}
        >
          <Text
            style={[
              styles.chipText,
              { color: filterStatut === "all" ? "#fff" : colors.foreground },
            ]}
          >
            {t("all")} ({actes.length})
          </Text>
        </TouchableOpacity>
        {STATUTS_LIST.map((key) => {
          const cfg = STATUT_CONFIG[key];
          const count = actes.filter((a) => a.statut === key).length;
          const active = filterStatut === key;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? cfg.color : colors.card,
                  borderColor: active ? cfg.color : colors.border,
                },
              ]}
              onPress={() => setFilterStatut(key)}
            >
              <Feather
                name={cfg.icon}
                size={11}
                color={active ? "#fff" : cfg.color}
              />
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#fff" : colors.foreground },
                ]}
              >
                {statusLabel(key)} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Type filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterRow, { paddingTop: 0 }]}
      >
        <TouchableOpacity
          style={[
            styles.chip,
            {
              backgroundColor:
                filterType === "all" ? colors.primary : colors.card,
              borderColor:
                filterType === "all" ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setFilterType("all")}
        >
          <Text
            style={[
              styles.chipText,
              { color: filterType === "all" ? "#fff" : colors.foreground },
            ]}
          >
            {t("actsAllTypes")}
          </Text>
        </TouchableOpacity>
        {TYPES_LIST.map((key) => {
          const cfg = TYPE_CONFIG[key];
          const active = filterType === key;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? cfg.color : colors.card,
                  borderColor: active ? cfg.color : colors.border,
                },
              ]}
              onPress={() => setFilterType(key)}
            >
              <Feather
                name={cfg.icon}
                size={11}
                color={active ? "#fff" : cfg.color}
              />
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#fff" : colors.foreground },
                ]}
              >
                {typeLabel(key)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <LoadingState
          title={t("actsLoadingTitle")}
          description={t("actsLoadingDescription")}
        />
      ) : loadError ? (
        <ErrorState
          title={t("actsLoadErrorTitle")}
          description={t("actsLoadErrorDescription")}
          retryLabel={t("retry")}
          onRetry={() => {
            setLoading(true);
            void fetchActes();
          }}
        />
      ) : displayed.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="file-text" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {t("actsEmptyTitle")}
          </Text>
          <Text
            style={[styles.emptySubtitle, { color: colors.mutedForeground }]}
          >
            {actes.length === 0 ? t("noActes") : t("actsFilteredEmpty")}
          </Text>
          {isAdmin && actes.length === 0 && (
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                resetForm();
                setCreating(true);
              }}
            >
              <Feather name="plus" size={14} color="#fff" />
              <Text style={styles.emptyBtnText}>{t("actsCreateFirst")}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            gap: 10,
            paddingBottom: insets.bottom + 40,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {displayed.map((acte) => {
            const tc = TYPE_CONFIG[acte.type];
            const sc = STATUT_CONFIG[acte.statut];
            return (
              <TouchableOpacity
                key={acte.id}
                style={[
                  styles.acteCard,
                  {
                    backgroundColor: colors.card,
                    borderColor:
                      acte.important && acte.statut !== "archive"
                        ? tc.color + "50"
                        : colors.border,
                  },
                ]}
                onPress={() => {
                  setSelected(acte);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.75}
              >
                <View style={styles.acteTop}>
                  <View
                    style={[
                      styles.acteIcon,
                      { backgroundColor: tc.color + "18" },
                    ]}
                  >
                    <Feather name={tc.icon} size={18} color={tc.color} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.acteBadges}>
                      <View
                        style={[
                          styles.typeBadge,
                          { backgroundColor: tc.color + "15" },
                        ]}
                      >
                        <Text
                          style={[styles.typeBadgeText, { color: tc.color }]}
                        >
                          {typeLabel(acte.type)}
                        </Text>
                      </View>
                      <View
                        style={[styles.statutBadge, { backgroundColor: sc.bg }]}
                      >
                        <Feather name={sc.icon} size={9} color={sc.color} />
                        <Text style={[styles.statutText, { color: sc.color }]}>
                          {statusLabel(acte.statut)}
                        </Text>
                      </View>
                      {acte.important && (
                        <View
                          style={[
                            styles.statutBadge,
                            { backgroundColor: "#ef444415" },
                          ]}
                        >
                          <Feather name="star" size={9} color="#ef4444" />
                          <Text
                            style={[styles.statutText, { color: "#ef4444" }]}
                          >
                            {t("actsImportant")}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[styles.acteTitre, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {acte.titre}
                    </Text>
                    <Text
                      style={[
                        styles.acteObjet,
                        { color: colors.mutedForeground },
                      ]}
                      numberOfLines={1}
                    >
                      {acte.objet}
                    </Text>
                  </View>
                </View>
                <View style={styles.acteFooter}>
                  <View style={styles.acteMeta}>
                    <Feather
                      name="hash"
                      size={11}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.acteMetaText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {acte.numero}
                    </Text>
                  </View>
                  <View style={styles.acteMeta}>
                    <Feather
                      name="calendar"
                      size={11}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.acteMetaText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {acte.date}
                    </Text>
                  </View>
                  {acte.dateEcheance ? (
                    <View style={styles.acteMeta}>
                      <Feather name="clock" size={11} color="#ef4444" />
                      <Text style={[styles.acteMetaText, { color: "#ef4444" }]}>
                        {t("actsDueDate")}: {acte.dateEcheance}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ─── Detail Modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected
          ? (() => {
              const tc = TYPE_CONFIG[selected.type];
              const sc = STATUT_CONFIG[selected.statut];
              return (
                <View
                  style={[styles.modal, { backgroundColor: colors.background }]}
                >
                  <View
                    style={[
                      styles.modalHeader,
                      {
                        backgroundColor: colors.card,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <TouchableOpacity onPress={() => setSelected(null)}>
                      <Feather name="x" size={22} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text
                      style={[styles.modalTitle, { color: colors.foreground }]}
                    >
                      {t("actsDetailTitle")}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        Share.share({
                          title: selected.titre,
                          message: `${selected.titre}\n\n${t("actsReferenceShort")}: ${selected.numero}\n${t("dateLabel")}: ${selected.date}\n\n${selected.resumeContenu ?? ""}`,
                        })
                      }
                    >
                      <Feather
                        name="share-2"
                        size={20}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    contentContainerStyle={{
                      padding: 20,
                      gap: 16,
                      paddingBottom: 40,
                    }}
                  >
                    {/* Title block */}
                    <View
                      style={[
                        styles.acteDetailHeader,
                        {
                          backgroundColor: tc.color + "12",
                          borderColor: tc.color + "30",
                        },
                      ]}
                    >
                      <Feather name={tc.icon} size={22} color={tc.color} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.acteBadges}>
                          <View
                            style={[
                              styles.typeBadge,
                              { backgroundColor: tc.color + "15" },
                            ]}
                          >
                            <Text
                              style={[
                                styles.typeBadgeText,
                                { color: tc.color },
                              ]}
                            >
                              {typeLabel(selected.type)}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.statutBadge,
                              { backgroundColor: sc.bg },
                            ]}
                          >
                            <Feather name={sc.icon} size={9} color={sc.color} />
                            <Text
                              style={[styles.statutText, { color: sc.color }]}
                            >
                              {statusLabel(selected.statut)}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.acteDetailTitre,
                            { color: colors.foreground },
                          ]}
                        >
                          {selected.titre}
                        </Text>
                      </View>
                    </View>

                    {/* Info grid */}
                    <View
                      style={[
                        styles.infoGrid,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {[
                        {
                          label: t("actsReferenceLabel"),
                          value: selected.numero,
                          icon: "hash" as const,
                        },
                        {
                          label: t("dateLabel"),
                          value:
                            selected.date +
                            (selected.dateEcheance
                              ? ` · ${t("actsDueDate")}: ${selected.dateEcheance}`
                              : ""),
                          icon: "calendar" as const,
                        },
                        {
                          label: t("authorLabel"),
                          value: selected.auteur,
                          icon: "user" as const,
                        },
                        {
                          label: t("actsObjectLabel"),
                          value: selected.objet,
                          icon: "target" as const,
                        },
                      ].map((row, i) => (
                        <View key={row.label}>
                          {i > 0 ? (
                            <View
                              style={[
                                styles.sep,
                                { backgroundColor: colors.border },
                              ]}
                            />
                          ) : null}
                          <View style={styles.infoRow}>
                            <View
                              style={[
                                styles.infoIcon,
                                { backgroundColor: colors.secondary },
                              ]}
                            >
                              <Feather
                                name={row.icon}
                                size={13}
                                color={colors.primary}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.infoLabel,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                {row.label}
                              </Text>
                              <Text
                                style={[
                                  styles.infoValue,
                                  { color: colors.foreground },
                                ]}
                              >
                                {row.value}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* Content */}
                    {selected.resumeContenu ? (
                      <View
                        style={[
                          styles.resumeBox,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.resumeLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {t("actsContentSummary").toUpperCase()}
                        </Text>
                        <Text
                          style={[
                            styles.resumeText,
                            { color: colors.foreground },
                          ]}
                        >
                          {selected.resumeContenu}
                        </Text>
                      </View>
                    ) : null}

                    {/* Signataires */}
                    {selected.signataires.length > 0 ? (
                      <View
                        style={[
                          styles.sigBox,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sigLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {t("actsSignatories").toUpperCase()}
                        </Text>
                        {selected.signataires.map((s, i) => (
                          <View key={i} style={styles.sigItem}>
                            <View
                              style={[
                                styles.sigDot,
                                { backgroundColor: "#10b981" },
                              ]}
                            />
                            <Text
                              style={[
                                styles.sigName,
                                { color: colors.foreground },
                              ]}
                            >
                              {s}
                            </Text>
                            <Feather
                              name="check-circle"
                              size={13}
                              color="#10b981"
                            />
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {/* Destinataires */}
                    {selected.destinataires.length > 0 ? (
                      <View
                        style={[
                          styles.sigBox,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sigLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {t("actsRecipients").toUpperCase()}
                        </Text>
                        {selected.destinataires.map((d, i) => (
                          <View key={i} style={styles.sigItem}>
                            <View
                              style={[
                                styles.sigDot,
                                { backgroundColor: tc.color },
                              ]}
                            />
                            <Text
                              style={[
                                styles.sigName,
                                { color: colors.foreground },
                              ]}
                            >
                              {d}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {/* Status change (admin only) */}
                    {isAdmin && (
                      <View
                        style={[
                          styles.sigBox,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sigLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {t("actsChangeStatus").toUpperCase()}
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                            marginTop: 8,
                          }}
                        >
                          {STATUTS_LIST.filter(
                            (s) => s !== selected.statut,
                          ).map((s) => {
                            const scBtn = STATUT_CONFIG[s];
                            return (
                              <TouchableOpacity
                                key={s}
                                style={[
                                  styles.statutChip,
                                  {
                                    backgroundColor: scBtn.bg,
                                    borderColor: scBtn.color,
                                  },
                                ]}
                                onPress={() => handleStatusChange(selected, s)}
                              >
                                <Feather
                                  name={scBtn.icon}
                                  size={11}
                                  color={scBtn.color}
                                />
                                <Text
                                  style={[
                                    styles.statutChipText,
                                    { color: scBtn.color },
                                  ]}
                                >
                                  {statusLabel(s)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Actions */}
                    <View style={styles.actionBtns}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          { backgroundColor: colors.primary },
                        ]}
                        onPress={() => openPdf(selected)}
                      >
                        <Feather name="download" size={15} color="#fff" />
                        <Text style={styles.actionBtnText}>
                          {t("actsDownloadPdf")}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          {
                            backgroundColor: colors.secondary,
                            borderWidth: 1,
                            borderColor: colors.border,
                          },
                        ]}
                        onPress={() =>
                          Share.share({
                            title: selected.titre,
                            message: `${selected.titre}\n\n${t("actsReferenceShort")}: ${selected.numero} — ${selected.date}\n${selected.resumeContenu ?? ""}`,
                          })
                        }
                      >
                        <Feather
                          name="share-2"
                          size={15}
                          color={colors.foreground}
                        />
                        <Text
                          style={[
                            styles.actionBtnText,
                            { color: colors.foreground },
                          ]}
                        >
                          {t("share")}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Delete (admin only) */}
                    {isAdmin && (
                      <TouchableOpacity
                        style={[styles.deleteBtn, { borderColor: "#ef444440" }]}
                        onPress={() => handleDelete(selected)}
                      >
                        <Feather name="trash-2" size={14} color="#ef4444" />
                        <Text style={styles.deleteBtnText}>
                          {t("actsDeleteAction")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
              );
            })()
          : null}
      </Modal>

      {/* ─── Create Modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={creating}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreating(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: colors.card,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity onPress={() => setCreating(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t("actsCreateTitle")}
            </Text>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={submitting}
              style={[
                styles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: submitting ? 0.6 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>{t("actsCreateAction")}</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
          >
            {/* Type */}
            <View>
              <Text
                style={[styles.formLabel, { color: colors.mutedForeground }]}
              >
                {t("actsTypeLabel").toUpperCase()} *
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              >
                {TYPES_LIST.map((t) => {
                  const cfg = TYPE_CONFIG[t];
                  const active = formType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: active ? cfg.color : colors.card,
                          borderColor: active ? cfg.color : colors.border,
                        },
                      ]}
                      onPress={() => setFormType(t)}
                    >
                      <Feather
                        name={cfg.icon}
                        size={12}
                        color={active ? "#fff" : cfg.color}
                      />
                      <Text
                        style={[
                          styles.typeChipText,
                          { color: active ? "#fff" : colors.foreground },
                        ]}
                      >
                        {typeLabel(t)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Numéro */}
            <View>
              <Text
                style={[styles.formLabel, { color: colors.mutedForeground }]}
              >
                {t("actsReferenceLabel").toUpperCase()} *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                placeholderTextColor={colors.mutedForeground}
                placeholder={t("actsReferencePlaceholder")}
                value={formNumero}
                onChangeText={setFormNumero}
                autoCapitalize="characters"
              />
            </View>

            {/* Titre */}
            <View>
              <Text
                style={[styles.formLabel, { color: colors.mutedForeground }]}
              >
                {t("titleLabel").toUpperCase()} *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                placeholderTextColor={colors.mutedForeground}
                placeholder={t("actsTitlePlaceholder")}
                value={formTitre}
                onChangeText={setFormTitre}
              />
            </View>

            {/* Objet */}
            <View>
              <Text
                style={[styles.formLabel, { color: colors.mutedForeground }]}
              >
                {t("actsObjectLabel").toUpperCase()} *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                placeholderTextColor={colors.mutedForeground}
                placeholder={t("actsObjectPlaceholder")}
                value={formObjet}
                onChangeText={setFormObjet}
              />
            </View>

            {/* Date + Échéance */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.formLabel, { color: colors.mutedForeground }]}
                >
                  {t("dateLabel").toUpperCase()} *
                </Text>
                <TextInput
                  style={[
                    styles.formInput,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholderTextColor={colors.mutedForeground}
                  placeholder={t("actsDatePlaceholder")}
                  value={formDate}
                  onChangeText={setFormDate}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.formLabel, { color: colors.mutedForeground }]}
                >
                  {t("actsDueDate").toUpperCase()}
                </Text>
                <TextInput
                  style={[
                    styles.formInput,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholderTextColor={colors.mutedForeground}
                  placeholder={t("optional")}
                  value={formEcheance}
                  onChangeText={setFormEcheance}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Auteur */}
            <View>
              <Text
                style={[styles.formLabel, { color: colors.mutedForeground }]}
              >
                {t("authorLabel").toUpperCase()} *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                placeholderTextColor={colors.mutedForeground}
                placeholder={t("actsAuthorPlaceholder")}
                value={formAuteur}
                onChangeText={setFormAuteur}
              />
            </View>

            {/* Résumé */}
            <View>
              <Text
                style={[styles.formLabel, { color: colors.mutedForeground }]}
              >
                {t("actsContentSummary").toUpperCase()}
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  styles.formTextArea,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                placeholderTextColor={colors.mutedForeground}
                placeholder={t("actsSummaryPlaceholder")}
                value={formResume}
                onChangeText={setFormResume}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Statut initial */}
            <View>
              <Text
                style={[styles.formLabel, { color: colors.mutedForeground }]}
              >
                {t("actsInitialStatus").toUpperCase()}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                {(["brouillon", "valide"] as ActeStatut[]).map((s) => {
                  const scBtn = STATUT_CONFIG[s];
                  const active = formStatut === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[
                        styles.statutChip,
                        {
                          backgroundColor: active ? scBtn.color : colors.card,
                          borderColor: active ? scBtn.color : colors.border,
                        },
                      ]}
                      onPress={() => setFormStatut(s)}
                    >
                      <Feather
                        name={scBtn.icon}
                        size={11}
                        color={active ? "#fff" : scBtn.color}
                      />
                      <Text
                        style={[
                          styles.statutChipText,
                          { color: active ? "#fff" : scBtn.color },
                        ]}
                      >
                        {statusLabel(s)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Important toggle */}
            <TouchableOpacity
              style={[
                styles.importantToggle,
                {
                  backgroundColor: formImportant ? "#ef444415" : colors.card,
                  borderColor: formImportant ? "#ef4444" : colors.border,
                },
              ]}
              onPress={() => {
                setFormImportant(!formImportant);
                Haptics.selectionAsync();
              }}
            >
              <Feather
                name={formImportant ? "star" : "star"}
                size={16}
                color={formImportant ? "#ef4444" : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.importantText,
                  { color: formImportant ? "#ef4444" : colors.mutedForeground },
                ]}
              >
                {formImportant
                  ? t("actsMarkedImportant")
                  : t("actsMarkImportant")}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  chipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 40,
  },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  acteCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  acteTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  acteIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  acteBadges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  statutBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statutText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  acteTitre: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 19 },
  acteObjet: { fontSize: 11, fontFamily: "Inter_400Regular" },
  acteFooter: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  acteMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  acteMetaText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 20 : 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  acteDetailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  acteDetailTitre: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 22,
    marginTop: 6,
  },
  infoGrid: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  sep: { height: 1 },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 2 },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium" },
  resumeBox: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  resumeLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  resumeText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 22 },
  sigBox: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  sigLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  sigItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  sigDot: { width: 6, height: 6, borderRadius: 3 },
  sigName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  actionBtns: { flexDirection: "row", gap: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  deleteBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#ef4444",
  },
  statutChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  statutChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 60,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  formLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  formTextArea: { minHeight: 100, paddingTop: 12 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  importantToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  importantText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});

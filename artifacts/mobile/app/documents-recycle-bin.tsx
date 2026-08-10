/**
 * documents-recycle-bin.tsx — Recycle Bin for soft-deleted documents.
 *
 * Admin-only. List / search / filter soft-deleted documents, restore them, or
 * (super_admin only) permanently purge them. Restore is available to
 * syndicate_admin + super_admin; purge is super_admin only (matches backend RBAC).
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { ErrorState, LoadingState } from "@/components/DataState";

interface DeletedDoc {
  id: string;
  title: string;
  category: string;
  status: string;
  size: string;
  documentNumber: string;
  deletedAt: string;
  deletedByName: string | null;
  retentionUntil: string | null;
}

const CAT_LABEL_KEYS: Record<string, string> = {
  statuts: "documentCategoryStatutes",
  reglements: "documentCategoryRegulations",
  pv: "documentCategoryPv",
  juridique: "documentCategoryLegal",
  finances: "documentCategoryFinance",
  attestation: "documentCategoryCertificate",
};

const STATE_COPY = {
  loadingTitle: {
    fr: "Chargement de la corbeille",
    en: "Loading recycle bin",
    ar: "جارٍ تحميل سلة المحذوفات",
    es: "Cargando papelera",
  },
  loadingDescription: {
    fr: "Nous récupérons les documents supprimés.",
    en: "We are retrieving deleted documents.",
    ar: "نحن نسترجع المستندات المحذوفة.",
    es: "Estamos recuperando los documentos eliminados.",
  },
  unavailableTitle: {
    fr: "Corbeille indisponible",
    en: "Recycle bin unavailable",
    ar: "سلة المحذوفات غير متاحة",
    es: "Papelera no disponible",
  },
  unavailableDescription: {
    fr: "Les documents supprimés ne sont pas disponibles pour le moment. Vérifiez votre connexion puis réessayez.",
    en: "Deleted documents are unavailable right now. Check your connection and try again.",
    ar: "المستندات المحذوفة غير متاحة حالياً. تحقق من الاتصال ثم أعد المحاولة.",
    es: "Los documentos eliminados no están disponibles ahora. Compruebe su conexión e inténtelo de nuevo.",
  },
  retry: {
    fr: "Réessayer",
    en: "Retry",
    ar: "إعادة المحاولة",
    es: "Reintentar",
  },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  restoreError: {
    fr: "Impossible de restaurer ce document.",
    en: "Unable to restore this document.",
    ar: "تعذر استعادة هذا المستند.",
    es: "No se puede restaurar este documento.",
  },
  purgeError: {
    fr: "Impossible de supprimer définitivement ce document.",
    en: "Unable to permanently delete this document.",
    ar: "تعذر حذف هذا المستند نهائياً.",
    es: "No se puede eliminar permanentemente este documento.",
  },
} as const;

export default function DocumentsRecycleBin() {
  const { showToast } = useToast();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refreshDocuments } = useData();
  const { lang, isRTL, t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  const isSuperAdmin = user?.role === "super_admin";

  const formatDate = useCallback(
    (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      const locale =
        lang === "ar"
          ? "ar-MA"
          : lang === "en"
            ? "en-GB"
            : lang === "es"
              ? "es-ES"
              : "fr-MA";
      return date.toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    },
    [lang],
  );

  const formatCopy = useCallback(
    (key: string, values: Record<string, string>) => {
      return Object.entries(values).reduce(
        (message, [placeholder, value]) =>
          message.replace(`{${placeholder}}`, value),
        t(key),
      );
    },
    [t],
  );

  const [items, setItems] = useState<DeletedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = (await docsApi.deleted({ search: q })) as {
        data: DeletedDoc[];
      };
      setItems(res.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (doc: DeletedDoc) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusyId(doc.id);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.restore(doc.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setItems((prev) => prev.filter((d) => d.id !== doc.id));
      await refreshDocuments().catch(() => {});
      showToast({
        type: "success",
        title: t("recycleBinRestoreSuccessTitle"),
        message: formatCopy("recycleBinRestoreSuccessMessage", {
          name: doc.title,
        }),
      });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({
        type: "error",
        title: STATE_COPY.error[lang],
        message: STATE_COPY.restoreError[lang],
      });
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = (doc: DeletedDoc) => {
    Alert.alert(
      t("recycleBinPurgeTitle"),
      formatCopy("recycleBinPurgeMessage", { name: doc.title }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("recycleBinPurgeConfirm"),
          style: "destructive",
          onPress: async () => {
            setBusyId(doc.id);
            try {
              const { documents: docsApi } = await import("@/services/api");
              await docsApi.purge(doc.id);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              setItems((prev) => prev.filter((d) => d.id !== doc.id));
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              showToast({
                type: "error",
                title: STATE_COPY.error[lang],
                message: STATE_COPY.purgeError[lang],
              });
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          direction: isRTL ? "rtl" : "ltr",
        },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            flexDirection: isRTL ? "row-reverse" : "row",
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather
            name={isRTL ? "arrow-right" : "arrow-left"}
            size={22}
            color={colors.foreground}
          />
        </TouchableOpacity>
        <View
          style={{
            flex: 1,
            marginStart: 12,
            alignItems: isRTL ? "flex-end" : "flex-start",
          }}
        >
          <Text
            style={[
              styles.title,
              { color: colors.foreground, textAlign: isRTL ? "right" : "left" },
            ]}
          >
            {t("recycleBinTitle")}
          </Text>
          <Text
            style={[
              styles.subtitle,
              {
                color: colors.mutedForeground,
                textAlign: isRTL ? "right" : "left",
              },
            ]}
          >
            {formatCopy("recycleBinCount", { count: String(items.length) })}
          </Text>
        </View>
        <Feather name="trash-2" size={20} color={colors.mutedForeground} />
      </View>

      <View
        style={[
          styles.searchWrap,
          {
            margin: 12,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={t("recycleBinSearchPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            load(v);
          }}
        />
      </View>

      {loading ? (
        <LoadingState
          title={STATE_COPY.loadingTitle[lang]}
          description={STATE_COPY.loadingDescription[lang]}
          accentColor={colors.primary}
        />
      ) : loadError ? (
        <ErrorState
          title={STATE_COPY.unavailableTitle[lang]}
          description={STATE_COPY.unavailableDescription[lang]}
          retryLabel={STATE_COPY.retry[lang]}
          onRetry={() => void load(search)}
          accentColor={colors.primary}
        />
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Feather name="trash-2" size={36} color={colors.mutedForeground} />
          <Text
            style={[
              styles.emptyText,
              {
                color: colors.mutedForeground,
                textAlign: isRTL ? "right" : "left",
              },
            ]}
          >
            {t("recycleBinEmpty")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{
            padding: 12,
            gap: 10,
            paddingBottom: insets.bottom + 24,
          }}
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  flexDirection: isRTL ? "row-reverse" : "row",
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cardTitle,
                    {
                      color: colors.foreground,
                      textAlign: isRTL ? "right" : "left",
                    },
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.cardMeta,
                    {
                      color: colors.mutedForeground,
                      textAlign: isRTL ? "right" : "left",
                    },
                  ]}
                >
                  {t(CAT_LABEL_KEYS[item.category] ?? "documentCategoryAll")} ·{" "}
                  {item.size} ·{" "}
                  {formatCopy("recycleBinDeletedOn", {
                    date: formatDate(item.deletedAt),
                  })}
                  {item.deletedByName
                    ? ` ${formatCopy("recycleBinDeletedBy", { name: item.deletedByName })}`
                    : ""}
                </Text>
                {item.retentionUntil ? (
                  <Text
                    style={[
                      styles.cardMeta,
                      {
                        color: colors.mutedForeground,
                        marginTop: 2,
                        textAlign: isRTL ? "right" : "left",
                      },
                    ]}
                  >
                    {formatCopy("recycleBinRetentionUntil", {
                      date: formatDate(item.retentionUntil),
                    })}
                  </Text>
                ) : null}
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  disabled={busyId === item.id}
                  onPress={() => handleRestore(item)}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="rotate-ccw" size={14} color="#fff" />
                  )}
                </TouchableOpacity>
                {isSuperAdmin ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#ef4444" }]}
                    disabled={busyId === item.id}
                    onPress={() => handlePurge(item)}
                  >
                    <Feather name="x" size={14} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
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
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  cardMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});

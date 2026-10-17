import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { auth as authApi } from "@/services/api";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";

/**
 * "My condominiums": every condominium this account may act in, with the
 * role it has there. Switching asks the server for a session scoped to the
 * chosen condominium; the whole data layer is then rebuilt for it.
 */
type Lang = "fr" | "en" | "ar" | "es";
const S = {
  title: { fr: "Mes copropriétés", en: "My condominiums", ar: "إقاماتي", es: "Mis comunidades" },
  subtitle: { fr: "Choisissez la copropriété dans laquelle travailler", en: "Choose the condominium to work in", ar: "اختر الإقامة للعمل فيها", es: "Elija la comunidad" },
  current: { fr: "Actuelle", en: "Current", ar: "الحالية", es: "Actual" },
  switching: { fr: "Changement…", en: "Switching…", ar: "جارٍ التغيير…", es: "Cambiando…" },
  empty: { fr: "Aucune autre copropriété accessible.", en: "No other condominium available.", ar: "لا توجد إقامات أخرى.", es: "Ninguna otra comunidad." },
  loadError: { fr: "Impossible de charger vos copropriétés.", en: "Could not load your condominiums.", ar: "تعذر التحميل.", es: "No se pudo cargar." },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  portfolio: { fr: "Portefeuille de la société", en: "Company portfolio", ar: "محفظة الشركة", es: "Cartera" },
  draft: { fr: "Brouillon", en: "Draft", ar: "مسودة", es: "Borrador" },
  active: { fr: "Active", en: "Active", ar: "نشطة", es: "Activa" },
  suspended: { fr: "Suspendue", en: "Suspended", ar: "موقوفة", es: "Suspendida" },
  archived: { fr: "Archivée", en: "Archived", ar: "مؤرشفة", es: "Archivada" },
  via_org_admin: { fr: "administrateur de la société", en: "company administrator", ar: "مسير الشركة", es: "administrador" },
  via_membership: { fr: "affectation", en: "assignment", ar: "تكليف", es: "asignación" },
  via_home: { fr: "compte principal", en: "main account", ar: "الحساب الرئيسي", es: "cuenta principal" },
} as const;
const ROLE: Record<string, Record<Lang, string>> = {
  syndicate_admin: { fr: "Syndic", en: "Property manager", ar: "السنديك", es: "Administrador" },
  president: { fr: "Président", en: "President", ar: "الرئيس", es: "Presidente" },
  treasurer: { fr: "Trésorier", en: "Treasurer", ar: "أمين المال", es: "Tesorero" },
  secretary: { fr: "Secrétaire", en: "Secretary", ar: "الكاتب", es: "Secretario" },
  committee_member: { fr: "Conseil syndical", en: "Council member", ar: "عضو المجلس", es: "Consejo" },
  member: { fr: "Copropriétaire", en: "Co-owner", ar: "مالك مشترك", es: "Propietario" },
  tenant: { fr: "Locataire", en: "Tenant", ar: "مكترٍ", es: "Inquilino" },
};

export default function CoproprietesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lang } = useLanguage();
  const L = lang as Lang;
  const tr = (k: keyof typeof S) => S[k][L] ?? S[k].fr;
  const { switchContext, user } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof authApi.contexts>>["data"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      setRows((await authApi.contexts()).data ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const choose = async (syndicateId: string) => {
    if (switchingTo || syndicateId === user?.syndicateId) return;
    setSwitchingTo(syndicateId);
    try {
      await switchContext(syndicateId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Leave every screen of the previous condominium.
      if (router.canDismiss()) router.dismissAll();
      router.replace("/(tabs)" as any);
    } catch (e: any) {
      Alert.alert(tr("error"), e?.message || tr("loadError"));
      setSwitchingTo(null);
      load();
    }
  };

  const hasCompany = rows.some((r) => r.via === "org_admin");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={tr("title")} subtitle={tr("subtitle")} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <ErrorState title={tr("loadError")} description="" retryLabel={tr("retry")} onRetry={() => { setLoading(true); load(); }} accentColor={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {hasCompany && (
            <TouchableOpacity style={[styles.card, { backgroundColor: colors.primary + "12", borderColor: colors.primary }]} onPress={() => router.push("/portefeuille" as any)}>
              <View style={styles.row}>
                <Feather name="pie-chart" size={18} color={colors.primary} />
                <Text style={[styles.name, { color: colors.primary, flex: 1 }]}>{tr("portfolio")}</Text>
                <Feather name="chevron-right" size={18} color={colors.primary} />
              </View>
            </TouchableOpacity>
          )}
          {rows.length <= 1 && <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 12 }}>{tr("empty")}</Text>}
          {rows.map((c) => {
            const current = c.syndicateId === user?.syndicateId;
            const statusKey = (["draft", "active", "suspended", "archived"].includes(c.status) ? c.status : "active") as "draft" | "active" | "suspended" | "archived";
            return (
              <TouchableOpacity
                key={c.syndicateId}
                disabled={current || !!switchingTo}
                onPress={() => choose(c.syndicateId)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: current ? colors.primary : colors.border }]}
                accessibilityRole="button"
                accessibilityState={{ selected: current, busy: switchingTo === c.syndicateId }}
              >
                <View style={styles.row}>
                  <Feather name="home" size={18} color={current ? colors.primary : colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.foreground }]}>{c.name}</Text>
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                      {(ROLE[c.role]?.[L] ?? c.role)} · {tr(`via_${c.via}` as keyof typeof S)}
                      {c.city ? ` · ${c.city}` : ""}
                    </Text>
                    {c.organizationName ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{c.organizationName}</Text> : null}
                  </View>
                  {switchingTo === c.syndicateId ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : current ? (
                    <Text style={[styles.badge, { color: colors.primary }]}>{tr("current")}</Text>
                  ) : (
                    <Text style={[styles.badge, { color: statusKey === "active" ? "#10b981" : "#f59e0b" }]}>{tr(statusKey)}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

/**
 * MIZAN — Subscription Payment Screen
 *
 * Step 2 of the SaaS onboarding flow (post-syndicate-creation):
 * Register → Syndicate Setup → Payment → Team Invite → Dashboard
 *
 * Reads pending plan from AsyncStorage (set by register.tsx).
 * Allows choosing billing interval and payment method, then creates a
 * server-authoritative pending payment attempt. Activation happens only after
 * an authorized payment confirmation.
 */

import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/lib/api";

const PENDING_PLAN_KEY = "@mizan_pending_plan";

interface PendingPlan {
  planId: string;
  planName: string;
  planColor?: string;
  planPrice?: string;
  planYearlyPrice?: string;
  planInterval?: string;
}

const PAYMENT_METHODS = [
  {
    id: "card",
    icon: "credit-card" as const,
    color: "#2563EB",
  },
  {
    id: "bank_transfer",
    icon: "repeat" as const,
    color: "#059669",
  },
  {
    id: "paypal",
    icon: "dollar-sign" as const,
    color: "#2563EB",
  },
  {
    id: "moroccan_gateway",
    icon: "globe" as const,
    color: "#7C3AED",
  },
];

const PAYMENT_METHOD_LABELS: Record<string, { labelKey: string; hintKey: string }> = {
  card: { labelKey: "cardPayment", hintKey: "paymentCardHint" },
  bank_transfer: { labelKey: "bankTransfer", hintKey: "paymentTransferHint" },
  paypal: { labelKey: "paymentPaypalLabel", hintKey: "paymentPaypalHint" },
  moroccan_gateway: { labelKey: "paymentCmiLabel", hintKey: "paymentCmiHint" },
};

export default function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { token } = useAuth();
  const { t, lang } = useLanguage();

  const [plan, setPlan] = useState<PendingPlan | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [selectedMethod, setSelectedMethod] = useState("card");
  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [configuredMethods, setConfiguredMethods] = useState<string[]>([]);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<string | null>(null);

  const gradColors: [string, string] = isDark ? ["#070D1A", "#0D1929"] : ["#EFF6FF", "#F8FAFF"];
  const color = plan?.planColor ?? "#2563EB";

  useEffect(() => {
    AsyncStorage.getItem(PENDING_PLAN_KEY).then((raw) => {
      if (raw) {
        try { setPlan(JSON.parse(raw)); } catch {}
      }
      setLoadingPlan(false);
    });
    AsyncStorage.getItem("@mizan_pending_payment").then((raw) => {
      if (!raw) return;
      try {
        const pending = JSON.parse(raw);
        if (pending?.paymentId) {
          setPendingPaymentId(pending.paymentId);
          apiRequest(`/subscriptions/payments/${pending.paymentId}`, "GET")
            .then((result: any) => setPaymentState(result.data?.status ?? "pending"))
            .catch(() => setPaymentState("pending"));
        }
      } catch {}
    });
    apiRequest("/subscriptions/payment-methods")
      .then((result: any) => {
        const methods = (result.data ?? [])
          .filter((method: any) => method.configured)
          .map((method: any) => method.id);
        setConfiguredMethods(methods);
        if (methods.length > 0 && !methods.includes(selectedMethod)) {
          setSelectedMethod(methods[0]);
        }
      })
      .catch(() => setConfiguredMethods([]));
  }, []);

  const price = plan?.planPrice ? Number(plan.planPrice) : 0;
  const yearlyPrice = plan?.planYearlyPrice ? Number(plan.planYearlyPrice) : null;
  const displayPrice = billing === "yearly" ? yearlyPrice : price;
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-MA";
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
  const interpolate = (key: string, values: Record<string, string>) =>
    Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));

  async function handleConfirm() {
    if (!plan?.planId) {
      // No paid plan — navigate to team invite directly
      router.replace("/team-invite" as any);
      return;
    }

    if (selectedMethod === "bank_transfer") {
      Alert.alert(
        t("paymentTransferTitle"),
        t("paymentTransferInstructions"),
        [
          { text: t("subscriptionCancel"), style: "cancel" },
          { text: t("subscriptionConfirm"), onPress: () => doSubscribe() },
        ]
      );
      return;
    }

    doSubscribe();
  }

  async function doSubscribe() {
    if (!plan?.planId) return;
    setLoading(true);
    try {
      const storedKey = await AsyncStorage.getItem("@mizan_pending_payment_key");
      const idempotencyKey = storedKey ?? `${plan.planId}:${billing}:${selectedMethod}:${Date.now()}`;
      await AsyncStorage.setItem("@mizan_pending_payment_key", idempotencyKey);
      const result = await apiRequest("/subscriptions", "POST", {
        planId: plan.planId,
        billingInterval: billing,
        paymentMethod: selectedMethod,
        idempotencyKey,
      }, token);

      setPendingPaymentId(result.data?.id ?? null);
      setPaymentState(result.data?.status ?? "pending");
      await AsyncStorage.setItem("@mizan_pending_payment", JSON.stringify({
        paymentId: result.data?.id,
        planId: plan.planId,
        billing,
      }));
      Alert.alert(
        selectedMethod === "bank_transfer" ? t("paymentTransferTitle") : t("paymentPendingTitle"),
        selectedMethod === "bank_transfer" ? t("paymentTransferInstructions") : t("paymentPendingDescription"),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (error: any) {
      Alert.alert(t("paymentErrorTitle"), error?.message ?? t("paymentErrorDescription"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  if (loadingPlan) {
    return (
      <View style={[s.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF", alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // No paid plan — show free trial confirmation
  if (!plan || !plan.planId || price === 0) {
    return (
      <View style={[s.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF" }]}>
        <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24),
            paddingBottom: insets.bottom + 40,
            paddingHorizontal: 24,
            gap: 28,
            alignItems: "center",
          }}
        >
          <View style={[s.freeTrialCard, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#fff", borderColor: "#10B981" }]}>
            <View style={[s.trialIconWrap, { backgroundColor: "#10B98120" }]}>
              <Feather name="gift" size={36} color="#10B981" />
            </View>
            <Text style={[s.trialTitle, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
              {t("paymentFreeTrialTitle")}
            </Text>
            <Text style={[s.trialSub, { color: isDark ? "rgba(232,240,254,0.6)" : "#64748B" }]}>
              {t("paymentFreeTrialDescription")}
            </Text>
            <View style={[s.trialFeatures, { borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(16,185,129,0.15)" }]}>
              {[
                "paymentTrialFeatureAll",
                "paymentTrialFeatureData",
                "paymentTrialFeatureNoCard",
                "paymentTrialFeatureCancel",
              ].map((featureKey) => (
                <View key={featureKey} style={s.trialFeatureRow}>
                  <Feather name="check-circle" size={14} color="#10B981" />
                  <Text style={[s.trialFeatureText, { color: isDark ? "rgba(232,240,254,0.75)" : "#374151" }]}>
                    {t(featureKey)}
                  </Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: "#10B981" }]}
              onPress={() => router.replace("/team-invite" as any)}
              activeOpacity={0.85}
            >
              <Text style={s.ctaBtnText}>{t("paymentTeamInvite")}</Text>
              <Feather name="arrow-right" size={17} color="#fff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF" }]}>
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={isDark ? "#93C5FD" : "#2563EB"} />
        </TouchableOpacity>

        {/* Header */}
        <View style={{ gap: 6 }}>
          <Text style={[s.title, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>{t("paymentHeaderTitle")}</Text>
          <Text style={[s.subtitle, { color: isDark ? "rgba(232,240,254,0.55)" : "#64748B" }]}>
            {t("paymentHeaderStep")}
          </Text>
        </View>

        {/* Plan summary card */}
        <View style={[s.planCard, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#fff", borderColor: color + "40" }]}>
          <LinearGradient colors={[color, color + "CC"]} style={s.planCardHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <View style={[s.planIconWrap, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <Feather name="zap" size={20} color="#fff" />
            </View>
            <View>
              <Text style={s.planCardName}>{plan.planName}</Text>
              <Text style={s.planCardDesc}>{t("paymentPlanActive")}</Text>
            </View>
          </LinearGradient>

          {/* Billing toggle */}
          <View style={s.planCardBody}>
            <Text style={[s.sectionLabel, { color: isDark ? "rgba(232,240,254,0.45)" : "#94A3B8" }]}>
              {t("paymentBillingSection")}
            </Text>
            <View style={[s.toggleWrap, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(37,99,235,0.07)", borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(37,99,235,0.15)" }]}>
              <TouchableOpacity
                style={[s.toggleBtn, billing === "monthly" && { backgroundColor: color }]}
                onPress={() => { setBilling("monthly"); Haptics.selectionAsync(); }}
              >
                <Text style={[s.toggleText, { color: billing === "monthly" ? "#fff" : (isDark ? "rgba(232,240,254,0.5)" : "#64748B") }]}>
                  {t("paymentMonthly")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, billing === "yearly" && { backgroundColor: color }]}
                onPress={() => { setBilling("yearly"); Haptics.selectionAsync(); }}
              >
                <Text style={[s.toggleText, { color: billing === "yearly" ? "#fff" : (isDark ? "rgba(232,240,254,0.5)" : "#64748B") }]}>
                  {t("paymentYearly")}
                </Text>
                 {yearlyPrice !== null && price > 0 && yearlyPrice < price * 12 ? (
                   <View style={[s.savePill, { backgroundColor: "#10B98125" }]}>
                     <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#10B981" }}>
                       -{Math.round((1 - yearlyPrice / (price * 12)) * 100)}%
                     </Text>
                   </View>
                 ) : null}
              </TouchableOpacity>
            </View>

            {/* Price display */}
            <View style={[s.priceBox, { backgroundColor: color + "10", borderColor: color + "25" }]}>
              <Text style={[s.priceBig, { color }]}>
                {formatAmount(displayPrice ?? 0)} {lang === "ar" ? "د.م." : "MAD"}
              </Text>
              <Text style={[s.pricePer, { color: isDark ? "rgba(232,240,254,0.5)" : "#64748B" }]}>
                {billing === "yearly" ? t("paymentPerYear") : t("paymentPerMonth")}
              </Text>
              {billing === "yearly" && yearlyPrice !== null && (
                <View style={[s.savingBadge, { backgroundColor: "#10B98120" }]}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#10B981" }}>
                    {interpolate("paymentSavings", {
                      amount: formatAmount(price * 12 - (yearlyPrice ?? 0)),
                    })}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Payment method */}
        <View style={{ gap: 12 }}>
          <Text style={[s.sectionLabel, { color: isDark ? "rgba(232,240,254,0.45)" : "#94A3B8" }]}>
            {t("paymentMethodsSection")}
          </Text>
           {PAYMENT_METHODS.filter((method) => configuredMethods.includes(method.id)).map((method) => (
             <TouchableOpacity
               key={method.id}
               style={[s.methodCard, {
                 backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#fff",
                 borderColor: selectedMethod === method.id ? method.color : (isDark ? "rgba(255,255,255,0.08)" : "rgba(37,99,235,0.12)"),
                 borderWidth: selectedMethod === method.id ? 2 : 1,
               }]}
               onPress={() => { setSelectedMethod(method.id); Haptics.selectionAsync(); }}
               activeOpacity={0.85}
             >
               <View style={[s.methodIconWrap, { backgroundColor: method.color + "18" }]}>
                 <Feather name={method.icon} size={20} color={method.color} />
               </View>
               <View style={{ flex: 1 }}>
                 <Text style={[s.methodLabel, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
                   {t(PAYMENT_METHOD_LABELS[method.id].labelKey)}
                 </Text>
                 <Text style={[s.methodSub, { color: isDark ? "rgba(232,240,254,0.45)" : "#64748B" }]}>
                   {t(PAYMENT_METHOD_LABELS[method.id].hintKey)}
                 </Text>
               </View>
               <View style={[s.radioOuter, { borderColor: selectedMethod === method.id ? method.color : (isDark ? "rgba(255,255,255,0.2)" : "rgba(37,99,235,0.3)") }]}>
                 {selectedMethod === method.id && (
                   <View style={[s.radioInner, { backgroundColor: method.color }]} />
                 )}
               </View>
             </TouchableOpacity>
           ))}
           {configuredMethods.length === 0 && (
             <View style={[s.securityNote, { backgroundColor: isDark ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.08)", borderColor: "#f59e0b40" }]}>
               <Feather name="alert-triangle" size={14} color="#f59e0b" />
               <Text style={[s.securityText, { color: isDark ? "rgba(232,240,254,0.7)" : "#92400E" }]}>
                 {t("paymentNoMethodsConfigured")}
               </Text>
             </View>
           )}
        </View>

        {/* Security note */}
        <View style={[s.securityNote, { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(37,99,235,0.04)", borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(37,99,235,0.1)" }]}>
          <Feather name="shield" size={14} color={isDark ? "#60A5FA" : "#2563EB"} />
          <Text style={[s.securityText, { color: isDark ? "rgba(232,240,254,0.5)" : "#64748B" }]}>
            {t("paymentSecurityNote")}
          </Text>
        </View>

        {/* Confirm button */}
        <TouchableOpacity
          style={[s.ctaBtn, { backgroundColor: color, opacity: loading ? 0.7 : 1 }]}
          onPress={handleConfirm}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name="lock" size={17} color="#fff" />
              <Text style={s.ctaBtnText}>
                {interpolate("paymentPayButton", {
                  amount: `${formatAmount(displayPrice ?? 0)}${lang === "ar" ? " د.م." : ""}`,
                })}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {pendingPaymentId && (
          <View style={[s.securityNote, { backgroundColor: isDark ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.08)", borderColor: "#f59e0b40" }]}>
            <Feather name="clock" size={14} color="#f59e0b" />
            <Text style={[s.securityText, { color: isDark ? "rgba(232,240,254,0.7)" : "#92400E" }]}>
              {t("paymentPendingDescription")} {paymentState ? `(${paymentState})` : ""}
            </Text>
          </View>
        )}

        {/* Skip option for already-paying users */}
        <TouchableOpacity
          style={{ alignItems: "center", paddingVertical: 8 }}
          onPress={() => router.replace("/team-invite" as any)}
        >
          <Text style={[s.skipText, { color: isDark ? "rgba(232,240,254,0.35)" : "#94A3B8" }]}>
            {t("paymentPayLater")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    alignSelf: "flex-start",
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.3 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11,
    letterSpacing: 1.2, textTransform: "uppercase",
  },

  planCard: { borderRadius: 20, borderWidth: 1.5, overflow: "hidden" },
  planCardHeader: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 20,
  },
  planIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  planCardName: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#fff" },
  planCardDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  planCardBody: { padding: 20, gap: 16 },

  toggleWrap: {
    flexDirection: "row", borderRadius: 12,
    borderWidth: 1, padding: 4, alignSelf: "flex-start",
  },
  toggleBtn: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 9, gap: 6,
  },
  toggleText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  savePill: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },

  priceBox: {
    flexDirection: "row", alignItems: "baseline", gap: 6,
    padding: 16, borderRadius: 14, borderWidth: 1, flexWrap: "wrap",
  },
  priceBig: { fontFamily: "Inter_700Bold", fontSize: 32, letterSpacing: -0.5 },
  pricePer: { fontFamily: "Inter_400Regular", fontSize: 14 },
  savingBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, alignSelf: "flex-end",
  },

  methodCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, padding: 16,
  },
  methodIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  methodLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  methodSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 10, height: 10, borderRadius: 5 },

  securityNote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  securityText: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1 },

  ctaBtn: {
    borderRadius: 16, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: "#2563EB", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  ctaBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  skipText: { fontFamily: "Inter_400Regular", fontSize: 13 },

  // Free trial variant
  freeTrialCard: {
    width: "100%", borderRadius: 24, borderWidth: 2,
    padding: 28, alignItems: "center", gap: 16,
  },
  trialIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  trialTitle: { fontFamily: "Inter_700Bold", fontSize: 24, textAlign: "center" },
  trialSub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
  trialFeatures: { width: "100%", gap: 12, paddingTop: 16, borderTopWidth: 1 },
  trialFeatureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  trialFeatureText: { fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 },
});

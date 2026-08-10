/**
 * MIZAN — Subscription Plans Screen
 *
 * Displayed before authentication as part of the welcome flow.
 * Plans are fetched dynamically from the database — nothing hardcoded.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: string | null; // monthly price (numeric as string from DB)
  yearlyPrice: string | null; // yearly price
  interval: string | null;
  features: string | null; // JSON string[]
  maxBuildings: number | null;
  maxLots: number | null;
  maxMembers: number | null;
  maxStorageGb: number | null;
  maxDocuments: number | null;
  maxSignatures: number | null;
  isTrial: boolean | null;
  sortOrder: number | null;
  color: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFeatures(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function formatPrice(
  price: string | null,
  yearly: boolean,
  yearlyPrice: string | null,
  freeLabel: string,
  locale: string,
): string {
  if (!price && !yearlyPrice) return freeLabel;
  const p = yearly && yearlyPrice ? Number(yearlyPrice) : Number(price ?? 0);
  if (p === 0) return freeLabel;
  return `${p.toLocaleString(locale)} MAD`;
}

function limitLabel(value: number | null, unit: string): string {
  if (value === null || value === 0) return `∞ ${unit}`;
  return `${value.toLocaleString()} ${unit}`;
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  yearly,
  isDark,
  isPopular,
}: {
  plan: Plan & { yearlyPrice?: string | null };
  yearly: boolean;
  isDark: boolean;
  isPopular: boolean;
}) {
  const { t, lang } = useLanguage();
  const color = plan.color ?? "#2563EB";
  const features = parseFeatures(plan.features);
  const locale =
    lang === "ar"
      ? "ar-MA"
      : lang === "es"
        ? "es-ES"
        : lang === "en"
          ? "en-US"
          : "fr-MA";
  const cardBg = isDark ? "#0D1929" : "#fff";
  const borderColor = isPopular
    ? color
    : isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(37,99,235,0.12)";

  return (
    <View
      style={[
        styles.planCard,
        {
          backgroundColor: cardBg,
          borderColor,
          borderWidth: isPopular ? 2 : 1,
        },
      ]}
    >
      {isPopular && (
        <LinearGradient
          colors={[color, color + "CC"]}
          style={styles.popularBadge}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Feather name="star" size={10} color="#fff" />
          <Text style={styles.popularBadgeText}>{t("publicPlanPopular")}</Text>
        </LinearGradient>
      )}

      {/* Plan header */}
      <View style={styles.planHeader}>
        <View style={[styles.planIconWrap, { backgroundColor: color + "20" }]}>
          <Feather
            name={plan.isTrial ? "gift" : isPopular ? "zap" : "package"}
            size={20}
            color={color}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.planName, { color: isDark ? "#E8F0FE" : "#0A1628" }]}
          >
            {plan.name}
          </Text>
          {plan.description ? (
            <Text
              style={[
                styles.planDesc,
                { color: isDark ? "rgba(232,240,254,0.5)" : "#64748B" },
              ]}
              numberOfLines={2}
            >
              {plan.description}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Price */}
      <View style={styles.priceRow}>
        <Text style={[styles.priceAmount, { color }]}>
          {formatPrice(
            plan.price,
            yearly,
            plan.yearlyPrice,
            t("publicPlanFree"),
            locale,
          )}
        </Text>
        {(Number(plan.price ?? 0) > 0 || Number(plan.yearlyPrice ?? 0) > 0) && (
          <Text
            style={[
              styles.pricePeriod,
              { color: isDark ? "rgba(232,240,254,0.45)" : "#94A3B8" },
            ]}
          >
            / {yearly ? t("perYear") : t("perMonth")}
          </Text>
        )}
        {yearly &&
          plan.price &&
          plan.yearlyPrice &&
          Number(plan.yearlyPrice) < Number(plan.price) * 12 && (
            <View
              style={[styles.saveBadge, { backgroundColor: "#10B981" + "25" }]}
            >
              <Text
                style={{
                  color: "#10B981",
                  fontSize: 10,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                -
                {Math.round(
                  (1 - Number(plan.yearlyPrice) / (Number(plan.price) * 12)) *
                    100,
                )}
                %
              </Text>
            </View>
          )}
      </View>

      {/* Resource limits */}
      <View
        style={[
          styles.limitsRow,
          {
            borderColor: isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(37,99,235,0.08)",
          },
        ]}
      >
        {[
          {
            icon: "home" as const,
            label: limitLabel(plan.maxBuildings, t("publicPlanBuildings")),
          },
          {
            icon: "grid" as const,
            label: limitLabel(plan.maxLots, t("publicPlanUnits")),
          },
          {
            icon: "users" as const,
            label: limitLabel(plan.maxMembers, t("publicPlanMembers")),
          },
          {
            icon: "hard-drive" as const,
            label: limitLabel(plan.maxStorageGb, t("publicPlanStorage")),
          },
        ].map((l, i) => (
          <View key={i} style={styles.limitItem}>
            <Feather name={l.icon} size={13} color={color} />
            <Text
              style={[
                styles.limitLabel,
                { color: isDark ? "rgba(232,240,254,0.6)" : "#475569" },
              ]}
            >
              {l.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Features list */}
      {features.length > 0 && (
        <View style={styles.featuresList}>
          {features.slice(0, 5).map((f, i) => (
            <View key={i} style={styles.featureItem}>
              <Feather name="check" size={14} color={color} />
              <Text
                style={[
                  styles.featureItemText,
                  { color: isDark ? "rgba(232,240,254,0.75)" : "#374151" },
                ]}
              >
                {f}
              </Text>
            </View>
          ))}
          {features.length > 5 && (
            <Text
              style={[
                styles.moreFeatures,
                { color: isDark ? "rgba(232,240,254,0.4)" : "#94A3B8" },
              ]}
            >
              +{features.length - 5} {t("publicPlanMoreFeatures")}
            </Text>
          )}
        </View>
      )}

      {/* CTA buttons */}
      <View style={styles.planCtas}>
        {plan.isTrial ? (
          <TouchableOpacity
            style={[
              styles.trialBtn,
              { borderColor: color, backgroundColor: color + "15" },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/register");
            }}
          >
            <Feather name="gift" size={15} color={color} />
            <Text style={[styles.trialBtnText, { color }]}>
              {t("publicPlanStartTrial")}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.choosePlanBtn,
              {
                backgroundColor: isPopular
                  ? color
                  : isDark
                    ? "rgba(255,255,255,0.07)"
                    : "#F1F5F9",
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push({
                pathname: "/register",
                params: {
                  planId: plan.id,
                  planName: plan.name,
                  planColor: plan.color ?? "#2563EB",
                  planPrice:
                    yearly && plan.yearlyPrice
                      ? plan.yearlyPrice
                      : (plan.price ?? "0"),
                  planInterval: yearly ? "yearly" : "monthly",
                },
              });
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.choosePlanText,
                { color: isPopular ? "#fff" : isDark ? "#E8F0FE" : "#0A1628" },
              ]}
            >
              {t("subscriptionChoosePlan")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearly, setYearly] = useState(false);

  useEffect(() => {
    apiRequest("/subscriptions/plans/public")
      .then((res: any) => setPlans(res.data ?? []))
      .catch(() => setError(t("publicPlansLoadError")))
      .finally(() => setLoading(false));
  }, [t]);

  const gradColors: [string, string] = isDark
    ? ["#070D1A", "#0D1929"]
    : ["#EFF6FF", "#F8FAFF"];

  const popularIndex =
    plans.findIndex((p) => !p.isTrial && (p.sortOrder ?? 0) === 1) !== -1
      ? plans.findIndex((p) => !p.isTrial && (p.sortOrder ?? 0) === 1)
      : plans.findIndex((p) => !p.isTrial);

  return (
    <View
      style={[styles.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF" }]}
    >
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) },
          ]}
        >
          <TouchableOpacity
            onPress={() => router.replace("/welcome" as any)}
            style={styles.backBtn}
          >
            <Feather
              name="arrow-left"
              size={20}
              color={isDark ? "#93C5FD" : "#2563EB"}
            />
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <Text
              style={[
                styles.headerTitle,
                { color: isDark ? "#E8F0FE" : "#0A1628" },
              ]}
            >
              {t("publicPlansTitle")}
            </Text>
            <Text
              style={[
                styles.headerSub,
                { color: isDark ? "rgba(232,240,254,0.55)" : "#64748B" },
              ]}
            >
              {t("publicPlansSubtitle")}
            </Text>
          </View>

          {/* Billing toggle */}
          <View
            style={[
              styles.toggleWrap,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(37,99,235,0.08)",
                borderColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(37,99,235,0.15)",
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                !yearly && { backgroundColor: "#2563EB" },
              ]}
              onPress={() => {
                setYearly(false);
                Haptics.selectionAsync();
              }}
            >
              <Text
                style={[
                  styles.toggleText,
                  {
                    color: !yearly
                      ? "#fff"
                      : isDark
                        ? "rgba(232,240,254,0.5)"
                        : "#64748B",
                  },
                ]}
              >
                {t("subscriptionMonthly")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                yearly && { backgroundColor: "#2563EB" },
              ]}
              onPress={() => {
                setYearly(true);
                Haptics.selectionAsync();
              }}
            >
              <Text
                style={[
                  styles.toggleText,
                  {
                    color: yearly
                      ? "#fff"
                      : isDark
                        ? "rgba(232,240,254,0.5)"
                        : "#64748B",
                  },
                ]}
              >
                {t("subscriptionYearly")}
              </Text>
              <View style={styles.savePill}>
                <Text
                  style={{
                    fontSize: 9,
                    fontFamily: "Inter_700Bold",
                    color: "#10B981",
                  }}
                >
                  -20%
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Body */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text
              style={[
                styles.loadingText,
                { color: isDark ? "rgba(232,240,254,0.5)" : "#64748B" },
              ]}
            >
              {t("publicPlansLoading")}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Feather
              name="wifi-off"
              size={40}
              color={isDark ? "rgba(232,240,254,0.3)" : "#CBD5E1"}
            />
            <Text
              style={[
                styles.errorText,
                { color: isDark ? "rgba(232,240,254,0.5)" : "#64748B" },
              ]}
            >
              {error}
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: "#2563EB" }]}
              onPress={() => {
                setLoading(true);
                setError(null);
                apiRequest("/subscriptions/plans/public")
                  .then((res: any) => setPlans(res.data ?? []))
                  .catch(() => setError(t("publicPlansLoadError")))
                  .finally(() => setLoading(false));
              }}
            >
              <Text
                style={{
                  color: "#2563EB",
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                {t("retryLabel")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : plans.length === 0 ? (
          <View style={styles.centered}>
            <Text
              style={{
                color: isDark ? "rgba(232,240,254,0.5)" : "#64748B",
                fontFamily: "Inter_400Regular",
                fontSize: 15,
              }}
            >
              {t("subscriptionNoPlans")}
            </Text>
          </View>
        ) : (
          <View style={styles.plansContainer}>
            {plans.map((plan, i) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                yearly={yearly}
                isDark={isDark}
                isPopular={i === popularIndex}
              />
            ))}
          </View>
        )}

        {/* Compare plans link */}
        <View style={styles.compareRow}>
          <Feather
            name="bar-chart-2"
            size={14}
            color={isDark ? "#60A5FA" : "#2563EB"}
          />
          <TouchableOpacity onPress={() => router.push("/get-started")}>
            <Text
              style={[
                styles.compareText,
                { color: isDark ? "#60A5FA" : "#2563EB" },
              ]}
            >
              {t("publicPlansCompare")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sales CTA */}
        <View
          style={[
            styles.salesCard,
            {
              backgroundColor: isDark
                ? "rgba(37,99,235,0.12)"
                : "rgba(37,99,235,0.06)",
              borderColor: isDark
                ? "rgba(59,130,246,0.25)"
                : "rgba(37,99,235,0.2)",
            },
          ]}
        >
          <View style={styles.salesInfoRow}>
            <Feather name="phone" size={20} color="#2563EB" />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.salesTitle,
                  { color: isDark ? "#E8F0FE" : "#0A1628" },
                ]}
              >
                {t("customPlan")}
              </Text>
              <Text
                style={[
                  styles.salesSub,
                  { color: isDark ? "rgba(232,240,254,0.5)" : "#64748B" },
                ]}
              >
                {t("contactTeam")}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.salesBtn, { backgroundColor: "#2563EB" }]}
            onPress={() => router.push("/get-started")}
          >
            <Text
              style={{
                color: "#fff",
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {t("subscriptionContactSales")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 40,
  },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: { gap: 4 },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    letterSpacing: -0.3,
  },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },

  toggleWrap: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    alignSelf: "flex-start",
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },
  toggleText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  savePill: {
    backgroundColor: "#10B981" + "25",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },

  plansContainer: { paddingHorizontal: 20, gap: 16 },

  planCard: {
    borderRadius: 20,
    padding: 20,
    gap: 16,
    overflow: "hidden",
  },
  popularBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomLeftRadius: 14,
  },
  popularBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#fff",
    letterSpacing: 0.3,
  },

  planHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  planIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  planName: { fontFamily: "Inter_700Bold", fontSize: 18 },
  planDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },

  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  priceAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    letterSpacing: -0.5,
  },
  pricePeriod: { fontFamily: "Inter_400Regular", fontSize: 14 },
  saveBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  limitsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  limitItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  limitLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },

  featuresList: { gap: 8 },
  featureItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureItemText: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  moreFeatures: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 },

  planCtas: { gap: 8 },
  choosePlanBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  choosePlanText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  trialBtn: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  trialBtnText: { fontFamily: "Inter_700Bold", fontSize: 15 },

  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 20,
  },
  compareText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    textDecorationLine: "underline",
  },

  salesCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "stretch",
    gap: 12,
  },
  salesInfoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  salesTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  salesSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  salesBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },

  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  retryBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});

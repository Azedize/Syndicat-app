import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MizanLogo from "@/components/brand/MizanLogo";
import { MIZAN } from "@/constants/brand";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { crossPlatformShadow } from "@/lib/shadow";

const SERVICES = [
  { icon: "shield" as const, titleKey: "welcomeGovernance", textKey: "welcomeGovernanceText" },
  { icon: "dollar-sign" as const, titleKey: "welcomeFinance", textKey: "welcomeFinanceText" },
  { icon: "file-text" as const, titleKey: "welcomeDocuments", textKey: "welcomeDocumentsText" },
  { icon: "tool" as const, titleKey: "welcomeMaintenance", textKey: "welcomeMaintenanceText" },
];

function TrustMark({
  icon,
  label,
  isDark,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.trustMark}>
      <View
        style={[
          styles.trustIcon,
          {
            backgroundColor: isDark ? "rgba(96,165,250,0.14)" : "#EFF6FF",
          },
        ]}
      >
       <Feather name={icon} size={14} color={isDark ? "#93C5FD" : MIZAN.colors.blue} />
      </View>
      <Text style={[styles.trustText, { color: isDark ? "#C7D6ED" : "#334155" }]}>{label}</Text>
    </View>
  );
}

function ServiceRow({
  service,
  colors,
  t,
}: {
  service: (typeof SERVICES)[number];
  colors: ReturnType<typeof useColors>;
  t: (key: string) => string;
}) {
  return (
    <View style={[styles.serviceRow, { borderTopColor: colors.border }]}>
      <View style={[styles.serviceIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={service.icon} size={17} color={colors.primary} />
      </View>
      <View style={styles.serviceCopy}>
        <Text style={[styles.serviceTitle, { color: colors.foreground }]}>{t(service.titleKey)}</Text>
        <Text style={[styles.serviceText, { color: colors.mutedForeground }]}>{t(service.textKey)}</Text>
      </View>
    </View>
  );
}

function PromiseBand({
  isDark,
  colors,
  t,
}: {
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
  t: (key: string) => string;
}) {
  const promises = [
    { icon: "compass" as const, label: t("welcomePilotage") },
    { icon: "check-circle" as const, label: t("welcomeAllInOne") },
    { icon: "users" as const, label: t("welcomeMoroccoReady") },
  ];

  return (
    <View style={[styles.promiseBand, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {promises.map((promise) => (
        <View key={promise.label} style={styles.promiseItem}>
          <View style={[styles.promiseIcon, { backgroundColor: colors.accent }]}>
            <Feather name={promise.icon} size={15} color={colors.primary} />
          </View>
          <Text style={[styles.promiseText, { color: isDark ? colors.foreground : colors.cardForeground }]}>
            {promise.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, toggle } = useTheme();
  const { t, isRTL } = useLanguage();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const stackHeroActions = width < 520;
  // Keep the landing page legible on the very first frame (including Expo web
  // previews), while the content still gets a subtle upward entrance motion.
  const fade = useRef(new Animated.Value(1)).current;
  const rise = useRef(new Animated.Value(22)).current;

  useEffect(() => {
    Animated.timing(rise, { toValue: 0, duration: 650, useNativeDriver: Platform.OS !== "web" }).start();
  }, [fade, rise]);

  const background = colors.background;
  const panel = colors.card;
  const muted = colors.mutedForeground;
  const foreground = colors.foreground;

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
      <LinearGradient
        colors={isDark ? [colors.background, colors.muted, colors.background] : [colors.secondary, colors.background, colors.card]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14),
          paddingBottom: insets.bottom + 34,
        }}
      >
        <View style={styles.pagePadding}>
          <View style={[styles.topBar, isRTL && styles.rtlRow]}>
            <MizanLogo variant="horizontal" colorScheme={isDark ? "dark" : "light"} size={40} showTagline={false} />
            <View style={styles.headerActions}>
              <TouchableOpacity
                testID="welcome-login"
                onPress={() => {
                  Haptics.selectionAsync();
                  router.replace("/login");
                }}
                style={[
                  styles.loginButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
                activeOpacity={0.82}
              >
                <Text style={[styles.loginText, { color: colors.primary }]}>
                  {t("connect")}
                </Text>
                <Feather name="arrow-up-right" size={16} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                testID="welcome-theme-toggle"
                onPress={toggle}
                style={[styles.themeButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={isDark ? t("lightMode") : t("darkMode")}
              >
                <Feather name={isDark ? "sun" : "moon"} size={17} color={colors.foreground} />
                <Text style={[styles.themeLabel, { color: colors.foreground }]}>{isDark ? t("lightMode") : t("darkMode")}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Animated.View style={[styles.heroBlock, { opacity: fade, transform: [{ translateY: rise }] }]}>
            <View style={styles.heroCopy}>
              <View style={styles.eyebrow}>
                <View style={styles.liveDot} />
                <Text style={styles.eyebrowText}>{t("authEnterprisePlatform")}</Text>
              </View>
              <Text style={[styles.headline, { color: foreground }]}>
                {t("welcomeHeadline")}
                <Text style={styles.headlineAccent}>{t("welcomeHeadlineAccent")}</Text>
              </Text>
              <Text style={[styles.subtitle, { color: muted }]}>
                {t("welcomeSubtitle")}
              </Text>

              <View style={[styles.heroActions, stackHeroActions && styles.heroActionsStack]}>
                <TouchableOpacity
                  testID="welcome-discover"
                  style={[styles.primaryButton, stackHeroActions && styles.heroActionFullWidth]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    router.push("/intro");
                  }}
                  activeOpacity={0.86}
                >
                 <LinearGradient
                    colors={[MIZAN.colors.blueLight, MIZAN.colors.blue]}
                    style={styles.primaryButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text
                      style={styles.primaryButtonText}
                      numberOfLines={1}
                    >
                      {t("welcomeDiscover")}
                    </Text>
                    <Feather name="arrow-right" size={19} color="#FFFFFF" />
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="welcome-plans"
                  onPress={() => router.push("/plans")}
                  style={[
                    styles.plansButton,
                    stackHeroActions && styles.heroActionFullWidth,
                    {
                       borderColor: isDark ? "rgba(141,178,255,0.34)" : MIZAN.colors.bluePale,
                       backgroundColor: isDark ? "rgba(13,32,58,0.78)" : MIZAN.colors.white,
                    },
                  ]}
                  activeOpacity={0.82}
                >
                   <Text
                     style={[styles.plansButtonText, { color: isDark ? MIZAN.colors.bluePale : MIZAN.colors.blue }]}
                     numberOfLines={1}
                   >
                    {t("welcomeViewPlans")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <PromiseBand isDark={isDark} colors={colors} t={t} />
          </Animated.View>

          <View style={[styles.trustBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TrustMark icon="check-circle" label={t("welcomeLaw18")} isDark={isDark} />
            <TrustMark icon="lock" label={t("welcomeDataProtected")} isDark={isDark} />
            <TrustMark icon="globe" label={t("welcomeMoroccoReady")} isDark={isDark} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionKicker, { color: isDark ? "#60A5FA" : MIZAN.colors.blue }]}>{t("welcomeFrictionless")}</Text>
            <Text style={[styles.sectionTitle, { color: foreground }]}>{t("welcomeServicesTitle")}</Text>
            <Text style={[styles.sectionDescription, { color: muted }]}>
              {t("welcomeServicesDescription")}
            </Text>
          </View>

          <View style={styles.servicesGrid}>
            {SERVICES.map((service) => (
              <ServiceRow key={service.titleKey} service={service} colors={colors} t={t} />
            ))}
          </View>

          <View style={[styles.proofCard, { backgroundColor: panel, borderColor: colors.border }]}>
            <View style={styles.proofCopy}>
              <View style={styles.proofTag}>
                <Feather name="bar-chart-2" size={14} color="#60A5FA" />
                <Text style={styles.proofTagText}>{t("welcomePilotage")}</Text>
              </View>
              <Text style={[styles.proofTitle, { color: foreground }]}>{t("welcomePilotageTitle")}</Text>
              <Text style={[styles.proofText, { color: muted }]}>
                {t("welcomePilotageText")}
              </Text>
              <View style={styles.proofSignal}>
                <Feather name="check-circle" size={16} color="#34D399" />
                <Text style={[styles.proofSignalText, { color: muted }]}>{t("welcomePilotageSignal")}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.bottomCta, { backgroundColor: colors.primary }]}>
            <Text style={[styles.bottomCtaTitle, { color: colors.primaryForeground }]}>{t("welcomeBottomTitle")}</Text>
            <Text style={[styles.bottomCtaText, { color: colors.primaryForeground }]}>{t("welcomeBottomText")}</Text>
            <TouchableOpacity
              onPress={() => router.push("/get-started")}
              style={[styles.bottomCtaButton, { backgroundColor: colors.card }]}
              activeOpacity={0.86}
            >
              <Text style={[styles.bottomCtaButtonText, { color: colors.primary }]}>{t("welcomeStartFree")}</Text>
              <Feather name="arrow-right" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pagePadding: { paddingHorizontal: 22 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 30 },
  rtlRow: { flexDirection: "row-reverse" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  loginButton: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 22, paddingHorizontal: 13, paddingVertical: 9 },
  loginText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  heroBlock: { gap: 28 },
  heroCopy: { alignItems: "flex-start" },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 15 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#34D399" },
  eyebrowText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.3, color: "#60A5FA" },
  headline: { fontFamily: "Inter_700Bold", fontSize: 35, lineHeight: 42, letterSpacing: -1.1 },
  headlineAccent: { color: "#3B82F6" },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 23, marginTop: 14 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22, width: "100%" },
  heroActionsStack: { flexDirection: "column", alignItems: "stretch" },
  heroActionFullWidth: { flex: 0, width: "100%" },
  primaryButton: { flex: 1.15, minWidth: 0, borderRadius: 14, overflow: "hidden", ...crossPlatformShadow({ color: "#2563EB", offsetY: 6, opacity: 0.28, radius: 12, elevation: 7 }) },
  primaryButtonGradient: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 8 },
  primaryButtonText: { flexShrink: 1, color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14, textAlign: "center" },
  plansButton: { flex: 1, minWidth: 0, minHeight: 54, justifyContent: "center", alignItems: "center", borderRadius: 14, borderWidth: 1.3, paddingHorizontal: 10 },
  plansButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  themeButton: { minWidth: 38, height: 38, borderWidth: 1, borderRadius: 19, paddingHorizontal: 10, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center" },
  themeLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  promiseBand: { flexDirection: "row", flexWrap: "wrap", gap: 10, borderWidth: 1, borderRadius: 18, padding: 13 },
  promiseItem: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1, minWidth: 92 },
  promiseIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  promiseText: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 15 },
  trustBar: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10 },
  trustMark: { flexDirection: "row", alignItems: "center", gap: 6 },
  trustIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  trustText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  sectionHeader: { marginTop: 42, gap: 8 },
  sectionKicker: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.3 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 25, lineHeight: 31, letterSpacing: -0.6 },
  sectionDescription: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
  servicesGrid: { marginTop: 18 },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 76, borderTopWidth: 1 },
  serviceCopy: { flex: 1, gap: 4 },
  serviceIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  serviceTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  serviceText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 5 },
  proofCard: { borderRadius: 20, borderWidth: 1, padding: 16, marginTop: 26 },
  proofCopy: { flex: 1 },
  proofTag: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 9 },
  proofTagText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1, color: "#60A5FA" },
  proofTitle: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 22 },
  proofText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 8 },
  proofSignal: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 16 },
  proofSignalText: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16, flex: 1 },
  bottomCta: { alignItems: "center", marginTop: 36, padding: 22, borderRadius: 22, gap: 8 },
  bottomCtaTitle: { fontFamily: "Inter_700Bold", fontSize: 20, textAlign: "center" },
  bottomCtaText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center", opacity: 0.82 },
  bottomCtaButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", minHeight: 50, borderRadius: 13, marginTop: 8 },
  bottomCtaButtonText: { fontFamily: "Inter_700Bold", fontSize: 14 },
});
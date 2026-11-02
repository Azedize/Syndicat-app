import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MizanMark from "@/components/brand/MizanMark";
import ResidenceScene from "@/components/signature/ResidenceScene";
import { ZelligePattern } from "@/components/ui";
import { MIZAN } from "@/constants/brand";
import { DURATION, STAGGER } from "@/constants/motion";
import { RADIUS, SPACING } from "@/constants/spacing";
import { displayFace, FONT } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { setFirstLaunchStage } from "@/lib/firstLaunch";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ThemeToggleButton } from "@/components/theme/ThemeSwitcher";

const SERVICES = [
  { icon: "shield" as const, titleKey: "welcomeGovernance", textKey: "welcomeGovernanceText" },
  { icon: "dollar-sign" as const, titleKey: "welcomeFinance", textKey: "welcomeFinanceText" },
  { icon: "file-text" as const, titleKey: "welcomeDocuments", textKey: "welcomeDocumentsText" },
  { icon: "tool" as const, titleKey: "welcomeMaintenance", textKey: "welcomeMaintenanceText" },
];

// Illustration only (public page, no account): a generic residence of three
// buildings. It carries no figure and is hidden from screen readers.
const ILLUSTRATION = [
  { id: "a", name: "", floors: 5 },
  { id: "b", name: "", floors: 8 },
  { id: "c", name: "", floors: 4 },
];

const NUIT = MIZAN.colors.navyDeep;

/**
 * Public landing — « le riad au crépuscule ». The mark draws itself and the
 * balance settles; the residence rises behind the promise. Everything is
 * interactive from the first frame (the choreography never blocks).
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, toggle } = useTheme();
  const { t, isRTL, lang } = useLanguage();
  const ar = lang === "ar";
  const colors = useColors();
  const { width } = useWindowDimensions();
  const pageW = Math.min(width, 560);
  const hPad = 22;

  const tap = (fn: () => void, strong = false) => () => {
    // The user has seen the welcome page: later launches open the sign-in screen.
    setFirstLaunchStage("done");
    if (Platform.OS !== "web") {
      (strong ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) : Haptics.selectionAsync()).catch(() => {});
    }
    fn();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 34 }}>
        {/* ── Dusk hero ── */}
        <LinearGradient colors={["#2B2475", NUIT, "#0E0C1C"]} locations={[0, 0.55, 1]} style={[styles.hero, { paddingTop: insets.top + (Platform.OS === "web" ? 24 : 12) }]}>
          <ZelligePattern opacity={0.035} />
          <View style={[styles.page, { width: pageW, paddingHorizontal: hPad }]}>
            <View style={styles.topBar}>
              <View style={styles.brandRow}>
                <MizanMark size={30} tile />
                {/* Narrow phones: the wordmark yields to language, theme and sign-in (the large mark follows). */}
                {pageW >= 420 ? <Text style={styles.brandWord} allowFontScaling={false}>MIZAN</Text> : null}
              </View>
              <View style={styles.topActions}>
                <LanguageSwitcher variant="onDark" testID="welcome-language" />
                <ThemeToggleButton onDark testID="welcome-theme-toggle" />
                <Pressable
                  testID="welcome-login"
                  onPress={tap(() => router.replace("/login"))}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.loginChip, pressed && styles.pressed]}
                >
                  <Text style={styles.loginChipText}>{t("connect")}</Text>
                  <Feather name={isRTL ? "arrow-up-left" : "arrow-up-right"} size={15} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>

            <View style={styles.markStage} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <MizanMark size={112} animated />
            </View>

            <Animated.View entering={FadeInDown.duration(DURATION.slow).delay(420)} style={styles.copy}>
              <Text style={[styles.eyebrow, lang === "ar" && { letterSpacing: 0 }]}>{t("authEnterprisePlatform")}</Text>
              <Text style={[styles.headline, ar && { fontFamily: displayFace(lang), lineHeight: 50 }]} accessibilityRole="header">
                {t("welcomeHeadline").trimEnd()}{" "}
                <Text style={styles.headlineAccent}>{t("welcomeHeadlineAccent")}</Text>
              </Text>
              <Text style={styles.subtitle}>{t("welcomeSubtitle")}</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(DURATION.slow).delay(520)} style={styles.ctaCol}>
              <Pressable
                testID="welcome-discover"
                onPress={tap(() => router.push("/intro"), true)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primary, pressed && { backgroundColor: colors.primaryStrong, transform: [{ scale: 0.985 }] }]}
              >
                <Text style={styles.primaryText} numberOfLines={1}>{t("welcomeDiscover")}</Text>
                <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={19} color="#FFFFFF" />
              </Pressable>
              <Pressable
                testID="welcome-plans"
                onPress={tap(() => router.push("/plans"))}
                accessibilityRole="button"
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryText} numberOfLines={1}>{t("welcomeViewPlans")}</Text>
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeIn.duration(DURATION.slow).delay(200)} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <ResidenceScene buildings={ILLUSTRATION} width={pageW - hPad * 2} height={170} accessibilityLabel="" animate={false} />
            </Animated.View>
          </View>
        </LinearGradient>

        {/* ── What the residence gets ── */}
        <View style={[styles.page, { width: pageW, paddingHorizontal: hPad }]}>
          <View style={[styles.trustBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { icon: "book-open" as const, label: t("welcomeLaw18") },
              { icon: "lock" as const, label: t("welcomeDataProtected") },
              { icon: "globe" as const, label: t("welcomeMoroccoReady") },
            ].map((m) => (
              <View key={m.label} style={styles.trustItem}>
                <Feather name={m.icon} size={14} color={colors.gold} />
                <Text style={[styles.trustText, { color: colors.textSecondary }]} numberOfLines={2}>{m.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionHead}>
            <Text style={[styles.kicker, { color: colors.goldText }, lang === "ar" && { letterSpacing: 0 }]}>{t("welcomeFrictionless")}</Text>
            <Text style={[styles.sectionTitle, { color: colors.foreground }, ar && { fontFamily: displayFace(lang), lineHeight: 42 }]} accessibilityRole="header">{t("welcomeServicesTitle")}</Text>
            <Text style={[styles.sectionText, { color: colors.textMuted }]}>{t("welcomeServicesDescription")}</Text>
          </View>

          <View style={[styles.services, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {SERVICES.map((s, i) => (
              <Animated.View key={s.titleKey} entering={FadeInDown.duration(DURATION.base).delay(i * STAGGER)} style={[styles.serviceRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={[styles.serviceIcon, { backgroundColor: colors.primarySoft }]}>
                  <Feather name={s.icon} size={18} color={colors.primary} />
                </View>
                <View style={styles.serviceCopy}>
                  <Text style={[styles.serviceTitle, { color: colors.foreground }]}>{t(s.titleKey)}</Text>
                  <Text style={[styles.serviceText, { color: colors.textMuted }]}>{t(s.textKey)}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          <LinearGradient colors={["#2B2475", NUIT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bottomCta}>
            <ZelligePattern opacity={0.04} />
            <Text style={[styles.bottomTitle, ar && { fontFamily: displayFace(lang), lineHeight: 36 }]}>{t("welcomeBottomTitle")}</Text>
            <Text style={styles.bottomText}>{t("welcomeBottomText")}</Text>
            <Pressable
              onPress={tap(() => router.push("/get-started"), true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.bottomBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }]}
            >
              <Text style={styles.bottomBtnText}>{t("welcomeStartFree")}</Text>
              <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={18} color={MIZAN.colors.blue} />
            </Pressable>
          </LinearGradient>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { alignItems: "center", overflow: "hidden", borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  page: { alignSelf: "center", maxWidth: "100%" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandWord: { fontFamily: "Fraunces_600SemiBold", fontSize: 19, letterSpacing: 3, color: "#FFFFFF" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  ghostIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.2)" },
  loginChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.24)" },
  loginChipText: { fontFamily: FONT.semibold, fontSize: 14, color: "#FFFFFF" },
  pressed: { opacity: 0.75 },
  markStage: { alignItems: "center", marginTop: 26, marginBottom: 6 },
  copy: { alignItems: "center", gap: 10, marginTop: 10 },
  eyebrow: { fontFamily: FONT.semibold, fontSize: 11, letterSpacing: 1.6, color: "#E3B75C", textAlign: "center" },
  headline: { fontFamily: FONT.display, fontSize: 33, lineHeight: 40, color: "#FFFFFF", textAlign: "center" },
  headlineAccent: { color: "#C9BEFF" },
  subtitle: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 23, color: "rgba(255,255,255,0.78)", textAlign: "center", maxWidth: 440 },
  ctaCol: { gap: 10, marginTop: 24 },
  primary: { minHeight: 54, borderRadius: RADIUS.MD + 2, backgroundColor: MIZAN.colors.blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  primaryText: { fontFamily: FONT.bold, fontSize: 15, color: "#FFFFFF", flexShrink: 1 },
  secondary: { minHeight: 50, borderRadius: RADIUS.MD + 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(201,190,255,0.4)" },
  secondaryText: { fontFamily: FONT.semibold, fontSize: 14, color: "#E5DFFF" },
  trustBar: { flexDirection: "row", gap: 10, marginTop: SPACING.XL, padding: 14, borderRadius: RADIUS.LG, borderWidth: 1 },
  trustItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  trustText: { flex: 1, fontFamily: FONT.medium, fontSize: 11, lineHeight: 15 },
  sectionHead: { marginTop: 40, gap: 8 },
  kicker: { fontFamily: FONT.bold, fontSize: 11, letterSpacing: 1.4 },
  sectionTitle: { fontFamily: FONT.display, fontSize: 27, lineHeight: 34 },
  sectionText: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 21 },
  services: { marginTop: 18, borderRadius: RADIUS.LG + 4, borderWidth: 1, overflow: "hidden" },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  serviceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  serviceCopy: { flex: 1, gap: 3 },
  serviceTitle: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 21 },
  serviceText: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 19 },
  bottomCta: { alignItems: "center", marginTop: 36, padding: 24, borderRadius: 26, gap: 8, overflow: "hidden" },
  bottomTitle: { fontFamily: FONT.display, fontSize: 22, lineHeight: 29, textAlign: "center", color: "#FFFFFF" },
  bottomText: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 21, textAlign: "center", color: "rgba(255,255,255,0.8)" },
  bottomBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, alignSelf: "stretch", minHeight: 52, borderRadius: 14, marginTop: 10, backgroundColor: "#FFFFFF" },
  bottomBtnText: { fontFamily: FONT.bold, fontSize: 15, color: MIZAN.colors.blue },
});

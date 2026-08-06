/**
 * VERIDIAN — Welcome Screen
 *
 * First screen displayed to every new / unauthenticated user.
 * Full-screen premium experience before authentication.
 * Inspired by Stripe, Notion, Monday.com entry experiences.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Path,
  Rect,
} from "react-native-svg";

import VeridianLogo from "@/components/brand/VeridianLogo";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

// ─── Decorative background elements ──────────────────────────────────────────

function BackgroundDecoration({ isDark }: { isDark: boolean }) {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMid slice"
    >
      <Defs>
        <SvgGradient id="glow1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B82F6" stopOpacity="0.18" />
          <Stop offset="1" stopColor="#2563EB" stopOpacity="0.0" />
        </SvgGradient>
        <SvgGradient id="glow2" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F59E0B" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#F59E0B" stopOpacity="0.0" />
        </SvgGradient>
      </Defs>
      {/* Top-right radial glow */}
      <Circle cx="340" cy="80" r="180" fill="url(#glow1)" />
      {/* Bottom-left accent */}
      <Circle cx="60" cy="720" r="140" fill="url(#glow2)" />
      {/* Subtle grid lines */}
      {[80, 160, 240, 320, 400, 480, 560, 640, 720, 800].map((y) => (
        <Path
          key={y}
          d={`M0,${y} L390,${y}`}
          stroke={isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"}
          strokeWidth="1"
        />
      ))}
      {[40, 120, 200, 280, 360].map((x) => (
        <Path
          key={x}
          d={`M${x},0 L${x},844`}
          stroke={isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"}
          strokeWidth="1"
        />
      ))}
      {/* Decorative building silhouette */}
      <Rect
        x="20"
        y="730"
        width="18"
        height="60"
        rx="2"
        fill={isDark ? "rgba(59,130,246,0.12)" : "rgba(37,99,235,0.08)"}
      />
      <Rect
        x="44"
        y="710"
        width="24"
        height="80"
        rx="2"
        fill={isDark ? "rgba(59,130,246,0.12)" : "rgba(37,99,235,0.08)"}
      />
      <Rect
        x="74"
        y="740"
        width="14"
        height="50"
        rx="2"
        fill={isDark ? "rgba(59,130,246,0.10)" : "rgba(37,99,235,0.06)"}
      />
      <Rect
        x="310"
        y="720"
        width="20"
        height="70"
        rx="2"
        fill={isDark ? "rgba(59,130,246,0.10)" : "rgba(37,99,235,0.06)"}
      />
      <Rect
        x="336"
        y="700"
        width="28"
        height="90"
        rx="2"
        fill={isDark ? "rgba(59,130,246,0.12)" : "rgba(37,99,235,0.08)"}
      />
      <Rect
        x="370"
        y="730"
        width="16"
        height="60"
        rx="2"
        fill={isDark ? "rgba(59,130,246,0.08)" : "rgba(37,99,235,0.05)"}
      />
    </Svg>
  );
}

// ─── Floating pill badge ──────────────────────────────────────────────────────

function PillBadge({
  icon,
  label,
  isDark,
}: {
  icon: string;
  label: string;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: isDark
            ? "rgba(37,99,235,0.25)"
            : "rgba(37,99,235,0.12)",
          borderColor: isDark ? "rgba(59,130,246,0.4)" : "rgba(37,99,235,0.25)",
        },
      ]}
    >
      <Feather name={icon as any} size={13} color="#3B82F6" />
      <Text
        style={[styles.pillText, { color: isDark ? "#93C5FD" : "#2563EB" }]}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { isDark } = useTheme();

  // Animated values
  const logoAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const headingAnim = useRef(new Animated.Value(0)).current;
  const headingY = useRef(new Animated.Value(24)).current;
  const subAnim = useRef(new Animated.Value(0)).current;
  const pillsAnim = useRef(new Animated.Value(0)).current;
  const ctaAnim = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.sequence([
      // Logo entrance
      Animated.parallel([
        Animated.timing(logoAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      // Heading slides up
      Animated.parallel([
        Animated.timing(headingAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(headingY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // Subtitle fades
      Animated.timing(subAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Pills appear
      Animated.timing(pillsAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // CTA rises up
      Animated.parallel([
        Animated.timing(ctaAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(ctaY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const gradientColors: [string, string, string] = isDark
    ? ["#070D1A", "#0D1929", "#0A1628"]
    : ["#EFF6FF", "#F8FAFF", "#DBEAFE"];

  return (
    <View
      style={[styles.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF" }]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        translucent
        backgroundColor="transparent"
      />
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      <BackgroundDecoration isDark={isDark} />

      <View
        style={[
          styles.inner,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
        {/* ── Skip / Sign in shortcut ── */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/login");
            }}
            style={[
              styles.skipBtn,
              {
                borderColor: isDark
                  ? "rgba(255,255,255,0.15)"
                  : "rgba(37,99,235,0.2)",
              },
            ]}
          >
            <Text
              style={[
                styles.skipText,
                { color: isDark ? "rgba(255,255,255,0.6)" : "#2563EB" },
              ]}
            >
              {t("authSignIn")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Hero area ── */}
        <View style={styles.heroArea}>
          {/* Logo with animated entrance */}
          <Animated.View
            style={{ opacity: logoAnim, transform: [{ scale: logoScale }] }}
          >
            <VeridianLogo
              variant="full"
              colorScheme={isDark ? "dark" : "light"}
              size={96}
              showTagline={false}
            />
          </Animated.View>

          {/* Heading */}
          <Animated.View
            style={{
              opacity: headingAnim,
              transform: [{ translateY: headingY }],
              alignItems: "center",
            }}
          >
            <Text
              style={[
                styles.headline,
                { color: isDark ? "#E8F0FE" : "#0A1628" },
              ]}
            >
              {t("welcomeHeadline")}
            </Text>
            <Text style={[styles.headlineAccent, { color: "#2563EB" }]}>
              {t("welcomeHeadlineAccent")}
            </Text>
          </Animated.View>

          {/* Subtitle */}
          <Animated.Text
            style={[
              styles.subtitle,
              {
                opacity: subAnim,
                color: isDark ? "rgba(232,240,254,0.6)" : "#64748B",
              },
            ]}
          >
            {t("welcomeSubtitle")}
          </Animated.Text>

          {/* Feature pills */}
          <Animated.View style={[styles.pills, { opacity: pillsAnim }]}>
            <PillBadge
              icon="shield"
              label={t("welcomeGovernance")}
              isDark={isDark}
            />
            <PillBadge
              icon="dollar-sign"
              label={t("welcomeFinance")}
              isDark={isDark}
            />
            <PillBadge
              icon="file-text"
              label={t("welcomeDocuments")}
              isDark={isDark}
            />
            <PillBadge
              icon="tool"
              label={t("welcomeMaintenance")}
              isDark={isDark}
            />
            <PillBadge
              icon="shopping-bag"
              label={t("welcomeMarketplace")}
              isDark={isDark}
            />
          </Animated.View>
        </View>

        {/* ── Capability strip: no fabricated usage metrics before authentication ── */}
        <Animated.View style={[styles.trustStrip, { opacity: subAnim }]}>
          {[
            { icon: "globe", label: t("welcomeMoroccoReady") },
            { icon: "lock", label: t("welcomeDataProtected") },
            { icon: "layers", label: t("welcomeAllInOne") },
          ].map((item) => (
            <View key={item.label} style={styles.trustItem}>
              <Feather
                name={item.icon as any}
                size={14}
                color={isDark ? "#60A5FA" : "#2563EB"}
              />
              <Text
                style={[
                  styles.trustLabel,
                  { color: isDark ? "#93C5FD" : "#2563EB" },
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </Animated.View>

        {/* ── CTA buttons ── */}
        <Animated.View
          style={[
            styles.ctaContainer,
            { opacity: ctaAnim, transform: [{ translateY: ctaY }] },
          ]}
        >
          {/* Primary CTA */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/intro");
            }}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={["#2563EB", "#1D4ED8"]}
              style={styles.primaryBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.primaryBtnText}>{t("welcomeDiscover")}</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Secondary CTA */}
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              {
                borderColor: isDark ? "rgba(59,130,246,0.5)" : "#2563EB",
                backgroundColor: isDark
                  ? "rgba(37,99,235,0.12)"
                  : "rgba(37,99,235,0.06)",
              },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/plans");
            }}
            activeOpacity={0.88}
          >
            <Text style={[styles.secondaryBtnText, { color: "#2563EB" }]}>
              {t("welcomeViewPlans")}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Legal footer ── */}
        <Text
          style={[
            styles.legalText,
            { color: isDark ? "rgba(232,240,254,0.3)" : "rgba(10,22,40,0.35)" },
          ]}
        >
          {t("welcomeLegalPrefix")}{" "}
          <Text
            style={{ color: isDark ? "#60A5FA" : "#2563EB" }}
            onPress={() => router.push("/terms" as any)}
          >
            {t("termsOfUse")}
          </Text>{" "}
          {t("welcomeLegalJoin")}{" "}
          <Text
            style={{ color: isDark ? "#60A5FA" : "#2563EB" }}
            onPress={() => router.push("/privacy" as any)}
          >
            {t("privacyPolicy")}
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 24 },

  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  skipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },

  heroArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },

  headline: {
    fontFamily: "Inter_700Bold",
    fontSize: 34,
    textAlign: "center",
    lineHeight: 42,
    marginTop: 16,
    letterSpacing: -0.5,
  },
  headlineAccent: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    textAlign: "center",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 4,
  },

  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },

  trustStrip: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginBottom: 20,
  },
  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trustLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },

  ctaContainer: {
    gap: 12,
    marginBottom: 12,
  },
  primaryBtn: {
    borderRadius: 14,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  primaryBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
    gap: 10,
  },
  primaryBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 15,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },

  legalText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 8,
  },
});

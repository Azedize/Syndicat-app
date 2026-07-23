/**
 * VERIDIAN — Get Started Screen
 *
 * Final CTA screen at the end of the welcome/onboarding flow.
 * Presents all entry actions: trial, sign in, create org, sales, demo.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop, Rect, Path } from "react-native-svg";

import VeridianLogo from "@/components/brand/VeridianLogo";
import { useTheme } from "@/context/ThemeContext";

// ─── Background decoration ────────────────────────────────────────────────────

function BGDecor({ isDark }: { isDark: boolean }) {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <SvgGradient id="gs1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2563EB" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#1D4ED8" stopOpacity="0.0" />
        </SvgGradient>
        <SvgGradient id="gs2" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#F59E0B" stopOpacity="0.1" />
          <Stop offset="1" stopColor="#F59E0B" stopOpacity="0.0" />
        </SvgGradient>
      </Defs>
      <Circle cx="350" cy="100" r="200" fill="url(#gs1)" />
      <Circle cx="40"  cy="750" r="160" fill="url(#gs2)" />
      {/* Hexagon pattern (decorative) */}
      {[[80, 200], [140, 160], [200, 200], [260, 160], [320, 200]].map(([x, y], i) => (
        <Path
          key={i}
          d={`M${x},${y - 28} L${x + 24},${y - 14} L${x + 24},${y + 14} L${x},${y + 28} L${x - 24},${y + 14} L${x - 24},${y - 14} Z`}
          fill="none"
          stroke={isDark ? "rgba(59,130,246,0.08)" : "rgba(37,99,235,0.06)"}
          strokeWidth="1"
        />
      ))}
    </Svg>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

interface ActionBtnProps {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  sublabel?: string;
  onPress: () => void;
  variant: "primary" | "secondary" | "outline" | "ghost";
  color?: string;
  isDark: boolean;
}

function ActionBtn({ icon, label, sublabel, onPress, variant, color = "#2563EB", isDark }: ActionBtnProps) {
  const cardBg =
    variant === "primary"   ? color :
    variant === "secondary" ? (isDark ? "rgba(37,99,235,0.15)" : "rgba(37,99,235,0.08)") :
    variant === "outline"   ? "transparent" :
    "transparent";
  const textColor =
    variant === "primary"   ? "#fff" :
    variant === "secondary" ? (isDark ? "#93C5FD" : "#2563EB") :
    variant === "outline"   ? color :
    (isDark ? "rgba(232,240,254,0.7)" : "#64748B");
  const borderColor =
    variant === "outline" ? color :
    variant === "secondary" ? (isDark ? "rgba(59,130,246,0.3)" : "rgba(37,99,235,0.2)") :
    "transparent";

  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        {
          backgroundColor: cardBg,
          borderColor,
          borderWidth: variant === "outline" || variant === "secondary" ? 1.5 : 0,
          shadowColor: variant === "primary" ? color : "transparent",
          elevation: variant === "primary" ? 6 : 0,
        },
      ]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.85}
    >
      <View style={[styles.actionIconWrap, { backgroundColor: variant === "primary" ? "rgba(255,255,255,0.2)" : color + "20" }]}>
        <Feather name={icon} size={18} color={variant === "primary" ? "#fff" : color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, { color: textColor }]}>{label}</Text>
        {sublabel && (
          <Text style={[styles.actionSublabel, { color: variant === "primary" ? "rgba(255,255,255,0.7)" : (isDark ? "rgba(232,240,254,0.45)" : "#94A3B8") }]}>
            {sublabel}
          </Text>
        )}
      </View>
      <Feather name="chevron-right" size={18} color={variant === "primary" ? "rgba(255,255,255,0.8)" : (isDark ? "rgba(232,240,254,0.3)" : "#CBD5E1")} />
    </TouchableOpacity>
  );
}

// ─── Certification badges ─────────────────────────────────────────────────────

const CERTS = [
  { icon: "shield" as const,    label: "ISO 27001" },
  { icon: "lock" as const,      label: "RGPD" },
  { icon: "server" as const,    label: "Cloud Maroc" },
  { icon: "check-circle" as const, label: "99.9% SLA" },
];

function CertStrip({ isDark }: { isDark: boolean }) {
  return (
    <View style={styles.certStrip}>
      {CERTS.map((c) => (
        <View key={c.label} style={[styles.certItem, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(37,99,235,0.07)", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(37,99,235,0.12)" }]}>
          <Feather name={c.icon} size={12} color={isDark ? "#60A5FA" : "#2563EB"} />
          <Text style={[styles.certLabel, { color: isDark ? "#93C5FD" : "#2563EB" }]}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Testimonial card ─────────────────────────────────────────────────────────

function TestimonialCard({ isDark }: { isDark: boolean }) {
  return (
    <View style={[styles.testimonial, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(37,99,235,0.05)", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(37,99,235,0.12)" }]}>
      <View style={styles.testimonialStars}>
        {[1, 2, 3, 4, 5].map(i => <Feather key={i} name="star" size={12} color="#F59E0B" />)}
      </View>
      <Text style={[styles.testimonialText, { color: isDark ? "rgba(232,240,254,0.7)" : "#475569" }]}>
        "VERIDIAN a transformé la gestion de notre résidence. Les assemblées générales en ligne et la signature électronique nous font gagner un temps précieux."
      </Text>
      <View style={styles.testimonialAuthor}>
        <View style={[styles.testimonialAvatar, { backgroundColor: "#2563EB" }]}>
          <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 11 }}>KA</Text>
        </View>
        <View>
          <Text style={[styles.testimonialName, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>Khalid Amrani</Text>
          <Text style={[styles.testimonialRole, { color: isDark ? "rgba(232,240,254,0.45)" : "#94A3B8" }]}>Syndic · Résidence Palmier, Casablanca</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GetStartedScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const gradColors: [string, string] = isDark
    ? ["#070D1A", "#0D1929"]
    : ["#EFF6FF", "#F8FAFF"];

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF" }]}>
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />
      <BGDecor isDark={isDark} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
          gap: 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back nav */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={isDark ? "#93C5FD" : "#2563EB"} />
        </TouchableOpacity>

        {/* Hero */}
        <Animated.View style={[styles.hero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <VeridianLogo
            variant="full"
            colorScheme={isDark ? "dark" : "light"}
            size={72}
            showTagline={true}
          />
          <View style={{ alignItems: "center", gap: 6, marginTop: 16 }}>
            <Text style={[styles.heroTitle, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
              Bienvenue sur VERIDIAN
            </Text>
            <Text style={[styles.heroSub, { color: isDark ? "rgba(232,240,254,0.55)" : "#64748B" }]}>
              Choisissez comment démarrer votre expérience.
            </Text>
          </View>
        </Animated.View>

        {/* Primary actions */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={[styles.sectionLabel, { color: isDark ? "rgba(232,240,254,0.45)" : "#94A3B8" }]}>
            DÉMARRER
          </Text>
          <View style={styles.actionList}>
            <ActionBtn
              variant="primary"
              icon="zap"
              label="Commencer gratuitement"
              sublabel="Essai 30 jours — aucune carte requise"
              onPress={() => router.push("/register")}
              color="#2563EB"
              isDark={isDark}
            />
            <ActionBtn
              variant="secondary"
              icon="log-in"
              label="Se connecter"
              sublabel="J'ai déjà un compte VERIDIAN"
              onPress={() => router.replace("/login")}
              color="#2563EB"
              isDark={isDark}
            />
          </View>
        </Animated.View>

        {/* Testimonial */}
        <TestimonialCard isDark={isDark} />

        {/* More options */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={[styles.sectionLabel, { color: isDark ? "rgba(232,240,254,0.45)" : "#94A3B8" }]}>
            AUTRES OPTIONS
          </Text>
          <View style={styles.actionList}>
            <ActionBtn
              variant="outline"
              icon="globe"
              label="Créer une organisation"
              sublabel="Enregistrer un nouveau syndicat"
              onPress={() => router.push("/register")}
              color="#7C3AED"
              isDark={isDark}
            />
            <ActionBtn
              variant="ghost"
              icon="phone"
              label="Contacter les ventes"
              sublabel="Pour les syndicats de grande taille"
              onPress={() => Linking.openURL("mailto:sales@veridian.ma")}
              color="#059669"
              isDark={isDark}
            />
            <ActionBtn
              variant="ghost"
              icon="monitor"
              label="Demander une démo"
              sublabel="Présentation personnalisée en ligne"
              onPress={() => Linking.openURL("mailto:demo@veridian.ma")}
              color="#D97706"
              isDark={isDark}
            />
          </View>
        </Animated.View>

        {/* Plan navigation shortcut */}
        <TouchableOpacity
          onPress={() => router.push("/plans")}
          style={[styles.plansLink, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(37,99,235,0.05)", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(37,99,235,0.12)" }]}
        >
          <Feather name="tag" size={15} color={isDark ? "#60A5FA" : "#2563EB"} />
          <Text style={[styles.plansLinkText, { color: isDark ? "#60A5FA" : "#2563EB" }]}>
            Voir les plans & tarifs
          </Text>
          <Feather name="arrow-right" size={14} color={isDark ? "#60A5FA" : "#2563EB"} />
        </TouchableOpacity>

        {/* Certifications */}
        <View style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: isDark ? "rgba(232,240,254,0.45)" : "#94A3B8", textAlign: "center" }]}>
            SÉCURITÉ &amp; CONFORMITÉ
          </Text>
          <CertStrip isDark={isDark} />
        </View>

        {/* Legal */}
        <Text style={[styles.legalText, { color: isDark ? "rgba(232,240,254,0.3)" : "rgba(10,22,40,0.35)" }]}>
          En créant un compte, vous acceptez les{" "}
          <Text style={{ color: isDark ? "#60A5FA" : "#2563EB" }}>Conditions d'utilisation</Text>
          {" "}et la{" "}
          <Text style={{ color: isDark ? "#60A5FA" : "#2563EB" }}>Politique de confidentialité</Text>
          {" "}de VERIDIAN.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    alignSelf: "flex-start",
  },

  hero: { alignItems: "center", paddingVertical: 8 },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.3 },
  heroSub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },

  section: { gap: 10 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  actionList: { gap: 10 },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    gap: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  actionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  actionSublabel: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },

  testimonial: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  testimonialStars: { flexDirection: "row", gap: 2 },
  testimonialText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, fontStyle: "italic" },
  testimonialAuthor: { flexDirection: "row", alignItems: "center", gap: 10 },
  testimonialAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  testimonialName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  testimonialRole: { fontFamily: "Inter_400Regular", fontSize: 11 },

  plansLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
  },
  plansLinkText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  certStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  certItem: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  certLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  legalText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11, textAlign: "center", lineHeight: 17,
  },
});

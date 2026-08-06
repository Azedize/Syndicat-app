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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import VeridianLogo from "@/components/brand/VeridianLogo";
import { VERIDIAN } from "@/constants/brand";
import { useTheme } from "@/context/ThemeContext";

const SERVICES = [
  { icon: "shield" as const, title: "Gouvernance", text: "AG, votes et décisions tracées" },
  { icon: "dollar-sign" as const, title: "Finance", text: "Charges, budgets et paiements en MAD" },
  { icon: "file-text" as const, title: "Documents", text: "Vos documents réunis et sécurisés" },
  { icon: "tool" as const, title: "Travaux", text: "Interventions suivies de bout en bout" },
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
        <Feather name={icon} size={14} color={isDark ? "#93C5FD" : VERIDIAN.colors.blue} />
      </View>
      <Text style={[styles.trustText, { color: isDark ? "#C7D6ED" : "#334155" }]}>{label}</Text>
    </View>
  );
}

function ServiceCard({
  service,
  isDark,
}: {
  service: (typeof SERVICES)[number];
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.serviceCard,
        {
          backgroundColor: isDark ? "rgba(16,31,55,0.84)" : "#FFFFFF",
          borderColor: isDark ? "rgba(96,165,250,0.17)" : "#DBEAFE",
        },
      ]}
    >
      <View style={[styles.serviceIcon, { backgroundColor: isDark ? "rgba(37,99,235,0.2)" : "#EFF6FF" }]}>
        <Feather name={service.icon} size={18} color={isDark ? "#60A5FA" : VERIDIAN.colors.blue} />
      </View>
      <Text style={[styles.serviceTitle, { color: isDark ? "#F8FAFF" : VERIDIAN.colors.navyDeep }]}>
        {service.title}
      </Text>
      <Text style={[styles.serviceText, { color: isDark ? "#8EA3C0" : "#64748B" }]}>{service.text}</Text>
    </View>
  );
}

function ProductStage({ isDark }: { isDark: boolean }) {
  const frame = isDark ? "#102442" : "#FFFFFF";
  const surface = isDark ? "#0A1628" : "#F8FBFF";
  const softSurface = isDark ? "#132C4D" : "#EDF4FF";
  const ink = isDark ? "#F8FAFF" : "#0A1628";
  const muted = isDark ? "#7F9BC2" : "#7085A0";

  return (
    <View style={styles.heroVisual}>
      <View style={[styles.glow, { backgroundColor: isDark ? "#2563EB" : "#93C5FD" }]} />
      <View style={[styles.productFrame, { backgroundColor: frame, borderColor: isDark ? "#35527D" : "#D5E5FA" }]}>
        <Svg width="100%" height={276} viewBox="0 0 300 276" preserveAspectRatio="xMidYMid meet">
          <Defs>
            <SvgGradient id="productBlue" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#5E9BFF" />
              <Stop offset="1" stopColor="#2563EB" />
            </SvgGradient>
            <SvgGradient id="productGlow" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#3B82F6" stopOpacity="0.32" />
              <Stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
            </SvgGradient>
          </Defs>
          <Rect width="300" height="276" rx="18" fill={surface} />
          <Circle cx="256" cy="18" r="110" fill="url(#productGlow)" />
          <Rect x="0" y="0" width="300" height="40" rx="18" fill={frame} />
          <Rect x="0" y="22" width="300" height="18" fill={frame} />
          <Circle cx="18" cy="20" r="7" fill="#34D399" />
          <Rect x="32" y="15" width="72" height="9" rx="4.5" fill={ink} opacity="0.85" />
          <Rect x="218" y="14" width="22" height="11" rx="5" fill={softSurface} />
          <Circle cx="263" cy="20" r="6" fill="#60A5FA" opacity="0.8" />
          <Rect x="14" y="54" width="62" height="200" rx="12" fill={frame} />
          <Rect x="27" y="70" width="36" height="7" rx="3.5" fill="#60A5FA" />
          <Rect x="27" y="98" width="35" height="8" rx="4" fill={softSurface} />
          <Rect x="27" y="122" width="28" height="8" rx="4" fill={softSurface} />
          <Rect x="27" y="146" width="34" height="8" rx="4" fill="#2563EB" />
          <Rect x="27" y="170" width="25" height="8" rx="4" fill={softSurface} />
          <Rect x="27" y="224" width="38" height="1" fill={softSurface} />
          <Circle cx="34" cy="241" r="8" fill="#F59E0B" opacity="0.9" />
          <Rect x="88" y="54" width="198" height="32" rx="10" fill={frame} />
          <Rect x="101" y="63" width="58" height="7" rx="3.5" fill={ink} opacity="0.78" />
          <Rect x="101" y="74" width="92" height="5" rx="2.5" fill={muted} opacity="0.8" />
          <Rect x="218" y="62" width="54" height="18" rx="9" fill="#2563EB" />
          <Path d="M232 71l4 4 8-9" stroke="#FFF" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Rect x="88" y="96" width="94" height="67" rx="12" fill={frame} />
          <Rect x="192" y="96" width="94" height="67" rx="12" fill={frame} />
          <Rect x="101" y="109" width="28" height="6" rx="3" fill={muted} />
          <Rect x="101" y="125" width="50" height="15" rx="5" fill={ink} opacity="0.9" />
          <Rect x="205" y="109" width="34" height="6" rx="3" fill={muted} />
          <Rect x="205" y="125" width="40" height="15" rx="5" fill="#34D399" opacity="0.9" />
          <Rect x="88" y="174" width="198" height="80" rx="12" fill={frame} />
          <Rect x="101" y="188" width="61" height="6" rx="3" fill={ink} opacity="0.78" />
          <Path d="M103 236 C120 222 128 230 140 214 S160 228 172 205 S192 218 204 198 S225 208 238 187 S258 200 273 181" stroke="url(#productBlue)" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d="M103 238 C120 224 128 232 140 216 S160 230 172 207 S192 220 204 200 S225 210 238 189 S258 202 273 183 L273 244 L103 244 Z" fill="url(#productGlow)" opacity="0.7" />
          <Circle cx="204" cy="200" r="4" fill="#FFFFFF" stroke="#3B82F6" strokeWidth="2" />
        </Svg>
        <View style={styles.stageCaption}>
          <View style={styles.captionLive}>
            <View style={styles.captionDot} />
            <Text style={styles.captionLiveText}>Interface conçue pour décider</Text>
          </View>
          <Text style={styles.captionText}>Tout votre syndic, au même endroit.</Text>
        </View>
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  // Keep the landing page legible on the very first frame (including Expo web
  // previews), while the content still gets a subtle upward entrance motion.
  const fade = useRef(new Animated.Value(1)).current;
  const rise = useRef(new Animated.Value(22)).current;

  useEffect(() => {
    Animated.timing(rise, { toValue: 0, duration: 650, useNativeDriver: true }).start();
  }, [fade, rise]);

  const background = isDark ? VERIDIAN.colors.navyDeep : "#F4F8FF";
  const panel = isDark ? VERIDIAN.colors.navyMid : "#FFFFFF";
  const muted = isDark ? "#91A5C0" : "#64748B";
  const foreground = isDark ? "#F8FAFF" : VERIDIAN.colors.navyDeep;

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={isDark ? ["#0A1B35", "#081326", "#07101E"] : ["#EAF3FF", "#F8FBFF", "#EEF5FF"]}
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
          <View style={styles.topBar}>
            <VeridianLogo variant="horizontal" colorScheme="dark" size={40} showTagline={false} />
            <TouchableOpacity
              testID="welcome-login"
              onPress={() => {
                Haptics.selectionAsync();
                router.replace("/login");
              }}
              style={[
                styles.loginButton,
                {
                  borderColor: isDark ? "rgba(147,197,253,0.38)" : "#BFDBFE",
                  backgroundColor: isDark ? "rgba(37,99,235,0.12)" : "#FFFFFF",
                },
              ]}
              activeOpacity={0.82}
            >
              <Text style={[styles.loginText, { color: isDark ? "#BFDBFE" : VERIDIAN.colors.blue }]}>
                Se connecter
              </Text>
              <Feather name="arrow-up-right" size={16} color={isDark ? "#93C5FD" : VERIDIAN.colors.blue} />
            </TouchableOpacity>
          </View>

          <Animated.View style={[styles.heroBlock, { opacity: fade, transform: [{ translateY: rise }] }]}>
            <View style={styles.heroCopy}>
              <View style={styles.eyebrow}>
                <View style={styles.liveDot} />
                <Text style={styles.eyebrowText}>LA PLATEFORME DES RÉSIDENCES MODERNES</Text>
              </View>
              <Text style={[styles.headline, { color: foreground }]}>
                La gestion de votre{"\n"}
                <Text style={styles.headlineAccent}>résidence, réinventée.</Text>
              </Text>
              <Text style={[styles.subtitle, { color: muted }]}>
                Une expérience claire et professionnelle pour piloter votre copropriété, communiquer avec vos résidents et garder chaque décision sous contrôle.
              </Text>

              <View style={styles.heroActions}>
                <TouchableOpacity
                  testID="welcome-discover"
                  style={styles.primaryButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    router.push("/intro");
                  }}
                  activeOpacity={0.86}
                >
                  <LinearGradient
                    colors={["#4D8DFF", "#2563EB"]}
                    style={styles.primaryButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={styles.primaryButtonText}>Découvrir la plateforme</Text>
                    <Feather name="arrow-right" size={19} color="#FFFFFF" />
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="welcome-plans"
                  onPress={() => router.push("/plans")}
                  style={[
                    styles.plansButton,
                    {
                      borderColor: isDark ? "rgba(147,197,253,0.34)" : "#BFDBFE",
                      backgroundColor: isDark ? "rgba(13,32,58,0.78)" : "#FFFFFF",
                    },
                  ]}
                  activeOpacity={0.82}
                >
                  <Text style={[styles.plansButtonText, { color: isDark ? "#BFDBFE" : VERIDIAN.colors.blue }]}>
                    Voir les plans
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <ProductStage isDark={isDark} />
          </Animated.View>

          <View
            style={[
              styles.trustBar,
              { backgroundColor: isDark ? "rgba(13,31,54,0.78)" : "#FFFFFF", borderColor: isDark ? "rgba(96,165,250,0.16)" : "#DBEAFE" },
            ]}
          >
            <TrustMark icon="check-circle" label="Conforme Loi 18-00" isDark={isDark} />
            <TrustMark icon="lock" label="Données protégées" isDark={isDark} />
            <TrustMark icon="globe" label="Pensé pour le Maroc" isDark={isDark} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionKicker, { color: isDark ? "#60A5FA" : VERIDIAN.colors.blue }]}>UNE GESTION SANS FRICTION</Text>
            <Text style={[styles.sectionTitle, { color: foreground }]}>Les services dont votre résidence a besoin</Text>
            <Text style={[styles.sectionDescription, { color: muted }]}>
              Des outils connectés pour remplacer les échanges dispersés par une gestion fluide, lisible et fiable.
            </Text>
          </View>

          <View style={styles.servicesGrid}>
            {SERVICES.map((service) => (
              <ServiceCard key={service.title} service={service} isDark={isDark} />
            ))}
          </View>

          <View style={[styles.proofCard, { backgroundColor: panel, borderColor: isDark ? "#203A61" : "#DBEAFE" }]}>
            <View style={styles.proofCopy}>
              <View style={styles.proofTag}>
                <Feather name="bar-chart-2" size={14} color="#60A5FA" />
                <Text style={styles.proofTagText}>PILOTAGE INTELLIGENT</Text>
              </View>
              <Text style={[styles.proofTitle, { color: foreground }]}>Une décision plus rapide. Une résidence plus sereine.</Text>
              <Text style={[styles.proofText, { color: muted }]}>
                Suivez les indicateurs essentiels et donnez à chaque membre une information claire, au bon moment.
              </Text>
              <View style={styles.proofMetricRow}>
                <View>
                  <Text style={[styles.metricValue, { color: foreground }]}>142</Text>
                  <Text style={[styles.metricLabel, { color: muted }]}>membres actifs</Text>
                </View>
                <View style={styles.metricDivider} />
                <View>
                  <Text style={[styles.metricValue, { color: foreground }]}>98%</Text>
                  <Text style={[styles.metricLabel, { color: muted }]}>recouvrement</Text>
                </View>
              </View>
            </View>
            <View style={styles.miniChart}>
              <Svg width="112" height="164" viewBox="0 0 112 164">
                <Rect width="112" height="164" rx="12" fill={isDark ? "#0A1628" : "#F1F6FF"} />
                <Rect x="12" y="14" width="48" height="6" rx="3" fill={isDark ? "#F8FAFF" : "#0A1628"} opacity="0.9" />
                <Rect x="12" y="28" width="70" height="5" rx="2.5" fill={isDark ? "#6E88AA" : "#94A3B8"} />
                {[42, 60, 51, 76, 68, 92].map((height, index) => (
                  <Rect
                    key={index}
                    x={12 + index * 15}
                    y={142 - height}
                    width="8"
                    height={height}
                    rx="4"
                    fill={index === 5 ? "#3B82F6" : "#8DB6FF"}
                    opacity={index === 5 ? 1 : 0.65}
                  />
                ))}
                <Path d="M12 144H100" stroke={isDark ? "#294365" : "#D5E5FA"} strokeWidth="1" />
              </Svg>
            </View>
          </View>

          <View style={styles.bottomCta}>
            <Text style={[styles.bottomCtaTitle, { color: foreground }]}>Prêt à mieux gérer votre résidence ?</Text>
            <Text style={[styles.bottomCtaText, { color: muted }]}>Commencez simplement. Évoluez avec une plateforme conçue pour durer.</Text>
            <TouchableOpacity
              onPress={() => router.push("/get-started")}
              style={styles.bottomCtaButton}
              activeOpacity={0.86}
            >
              <Text style={styles.bottomCtaButtonText}>Commencer gratuitement</Text>
              <Feather name="arrow-right" size={18} color="#FFFFFF" />
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
  primaryButton: { flex: 1, borderRadius: 14, overflow: "hidden", elevation: 7, shadowColor: "#2563EB", shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  primaryButtonGradient: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  primaryButtonText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  plansButton: { minHeight: 54, justifyContent: "center", alignItems: "center", borderRadius: 14, borderWidth: 1.3, paddingHorizontal: 15 },
  plansButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  heroVisual: { alignItems: "center", justifyContent: "center", minHeight: 330 },
  glow: { position: "absolute", width: 260, height: 260, borderRadius: 130, opacity: 0.18, transform: [{ scaleX: 1.18 }] },
  productFrame: { width: "82%", borderRadius: 25, borderWidth: 1, padding: 7, transform: [{ rotate: "-2deg" }], shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  stageCaption: { paddingHorizontal: 10, paddingVertical: 10, gap: 4 },
  captionLive: { flexDirection: "row", alignItems: "center", gap: 6 },
  captionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#34D399" },
  captionLiveText: { color: "#60A5FA", fontFamily: "Inter_600SemiBold", fontSize: 10 },
  captionText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  trustBar: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10 },
  trustMark: { flexDirection: "row", alignItems: "center", gap: 6 },
  trustIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  trustText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  sectionHeader: { marginTop: 42, gap: 8 },
  sectionKicker: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.3 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 25, lineHeight: 31, letterSpacing: -0.6 },
  sectionDescription: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  serviceCard: { width: "48.3%", minHeight: 142, borderRadius: 16, borderWidth: 1, padding: 14 },
  serviceIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  serviceTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  serviceText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 5 },
  proofCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, padding: 16, marginTop: 26, overflow: "hidden" },
  proofCopy: { flex: 1 },
  proofTag: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 9 },
  proofTagText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1, color: "#60A5FA" },
  proofTitle: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 22 },
  proofText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 8 },
  proofMetricRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 },
  metricValue: { fontFamily: "Inter_700Bold", fontSize: 21 },
  metricLabel: { fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 2 },
  metricDivider: { width: 1, height: 30, backgroundColor: "rgba(148,163,184,0.25)" },
  miniChart: { width: 112, height: 164, borderRadius: 12, overflow: "hidden" },
  bottomCta: { alignItems: "center", marginTop: 36, padding: 22, borderRadius: 22, backgroundColor: "#0E2A55", gap: 8 },
  bottomCtaTitle: { fontFamily: "Inter_700Bold", fontSize: 20, textAlign: "center" },
  bottomCtaText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center", color: "#9DB1CC" },
  bottomCtaButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", minHeight: 50, borderRadius: 13, backgroundColor: "#2563EB", marginTop: 8 },
  bottomCtaButtonText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF" },
});
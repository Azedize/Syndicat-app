/**
 * MIZAN — Enterprise Platform Introduction
 *
 * 9-page premium onboarding carousel.
 * Each slide showcases a different platform module with:
 *   • A unique SVG "live UI" rendered inside a premium phone mockup
 *   • Module tag, bold title, persuasive subtitle
 *   • Two KPI stats demonstrating business ROI
 *   • Three feature bullet points
 * Transitions use Animated interpolation for parallax depth.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  ImageSourcePropType,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Path,
  Stop,
  LinearGradient as SvgGrad,
} from "react-native-svg";
import VeridianLogo from "@/components/brand/VeridianLogo";
import { useTheme } from "@/context/ThemeContext";

const { width: W, height: H } = Dimensions.get("window");

const INTRO_IMAGES = {
  dashboard: require("../assets/intro/dashboard-kpis.png"),
  welcome: require("../assets/intro/welcome-screen.png"),
  welcomeAlt: require("../assets/intro/welcome-screen-alt.png"),
  landing: require("../assets/intro/landing-screen.jpg"),
};

// ─── SLIDES DATA ─────────────────────────────────────────────────────────────

const SLIDES = [
  {
    id: "dashboard",
    color: "#2563EB",
    tag: "DASHBOARD",
    image: INTRO_IMAGES.dashboard,
    title: "Vue d'ensemble complète",
    subtitle: "Votre résidence en un coup d'œil, en temps réel.",
    kpis: [
      { val: "142", lbl: "Membres actifs" },
      { val: "98%", lbl: "Recouvrement" },
    ],
    features: ["Tableaux de bord temps réel", "KPIs personnalisés", "Alertes intelligentes"],
  },
  {
    id: "finance",
    color: "#1D4ED8",
    tag: "FINANCE",
    image: INTRO_IMAGES.landing,
    title: "Finances maîtrisées",
    subtitle: "Gestion transparente de la trésorerie et des budgets.",
    kpis: [
      { val: "125k", lbl: "MAD encaissés" },
      { val: "12", lbl: "Impayés traités" },
    ],
    features: ["Charges en MAD", "Recouvrement automatisé", "Rapports PDF"],
  },
  {
    id: "ag",
    color: "#059669",
    tag: "ASSEMBLÉES",
    image: INTRO_IMAGES.welcome,
    title: "AG simplifiées",
    subtitle: "Des assemblées générales fluides et 100% légales.",
    kpis: [
      { val: "48h", lbl: "Quorum atteint" },
      { val: "100%", lbl: "Légal Loi 18-00" },
    ],
    features: ["Convocations électroniques", "Votes en ligne", "PV générés auto."],
  },
  {
    id: "docs",
    color: "#7C3AED",
    tag: "DOCUMENTS",
    image: INTRO_IMAGES.welcomeAlt,
    title: "Zéro papier",
    subtitle: "Centralisez et signez tous vos documents légaux.",
    kpis: [
      { val: "147", lbl: "Docs sécurisés" },
      { val: "AES", lbl: "Signature légale" },
    ],
    features: ["GED centralisée", "Signature électronique", "Archivage conforme"],
  },
  {
    id: "market",
    color: "#8B5CF6",
    tag: "MARKETPLACE",
    image: INTRO_IMAGES.landing,
    title: "Échanges entre voisins",
    subtitle: "Une communauté active et solidaire.",
    kpis: [
      { val: "4.5k", lbl: "MAD économisés" },
      { val: "500+", lbl: "Annonces" },
    ],
    features: ["Vente/Location interne", "Prestataires certifiés", "Paiement sécurisé"],
  },
  {
    id: "maintenance",
    color: "#D97706",
    tag: "MAINTENANCE",
    image: INTRO_IMAGES.dashboard,
    title: "Maintenance proactive",
    subtitle: "Gérez les travaux et interventions efficacement.",
    kpis: [
      { val: "23", lbl: "Tickets en cours" },
      { val: "48h", lbl: "Résolution moy." },
    ],
    features: ["Tickets avec priorités", "Suivi prestataires", "Photos et rapports"],
  },
  {
    id: "claims",
    color: "#E11D48",
    tag: "RÉCLAMATIONS",
    image: INTRO_IMAGES.welcomeAlt,
    title: "Litiges résolus",
    subtitle: "Un processus de médiation clair et tracé.",
    kpis: [
      { val: "95%", lbl: "Taux résolution" },
      { val: "24/7", lbl: "Médiation interne" },
    ],
    features: ["Dépôt en ligne", "Suivi en temps réel", "Escalade automatique"],
  },
  {
    id: "chat",
    color: "#0EA5E9",
    tag: "COMMUNICATION",
    image: INTRO_IMAGES.landing,
    title: "Toujours connecté",
    subtitle: "Communiquez instantanément avec la résidence.",
    kpis: [
      { val: "< 2h", lbl: "Réponse moy." },
      { val: "100%", lbl: "Des résidents" },
    ],
    features: ["Messagerie interne", "Notifications push", "Annonces officielles"],
  },
  {
    id: "national",
    color: "#6366F1",
    tag: "SUPERVISION",
    image: INTRO_IMAGES.welcome,
    title: "Vision nationale",
    subtitle: "Pilotez plusieurs syndicats depuis une seule interface.",
    kpis: [
      { val: "Multi", lbl: "Syndicats" },
      { val: "Live", lbl: "Dashboards" },
    ],
    features: ["Supervision multi-sites", "Comparatifs régionaux", "Export données"],
  }
];

// ─── SVG Mockups & Backgrounds ───────────────────────────────────────────────

function BgDeco({ color }: { color: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <SvgGrad id="grad1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.4" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGrad>
        <SvgGrad id="grad2" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.1" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </SvgGrad>
      </Defs>
      <Circle cx="350" cy="150" r="280" fill="url(#grad1)" />
      <Circle cx="40" cy="750" r="220" fill="url(#grad2)" />
      {[200, 300, 400, 500, 600, 700].map(y => (
        <Path key={`h${y}`} d={`M0,${y} L390,${y}`} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      ))}
      {[100, 200, 300].map(x => (
        <Path key={`v${x}`} d={`M${x},0 L${x},844`} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      ))}
    </Svg>
  );
}

function DashboardPreview() {
  return (
    <View style={styles.dashboardPreview}>
      <View style={styles.previewTopBar}>
        <View style={styles.previewDot} />
        <View style={styles.previewTopLine} />
        <View style={styles.previewDotBlue} />
      </View>
      <View style={styles.previewHeroLine} />
      <View style={styles.previewHeroLineShort} />
      <View style={styles.previewKpiRow}>
        <View style={styles.previewKpiCard}>
          <View style={styles.previewKpiValue} />
          <View style={styles.previewKpiLabel} />
        </View>
        <View style={styles.previewKpiCard}>
          <View style={styles.previewKpiValueGreen} />
          <View style={styles.previewKpiLabel} />
        </View>
      </View>
      <View style={styles.previewChart}>
        <View style={[styles.previewBar, { height: "34%" }]} />
        <View style={[styles.previewBar, { height: "56%" }]} />
        <View style={[styles.previewBar, { height: "43%" }]} />
        <View style={[styles.previewBar, { height: "78%" }]} />
        <View style={[styles.previewBar, { height: "64%" }]} />
        <View style={[styles.previewLine, { bottom: "46%" }]} />
      </View>
      <View style={styles.previewBottomRow}>
        <View style={styles.previewBottomPill} />
        <View style={styles.previewBottomPillShort} />
      </View>
    </View>
  );
}

function PresentationImage({
  source,
  compact = false,
  kind,
}: {
  source: ImageSourcePropType;
  compact?: boolean;
  kind?: string;
}) {
  return (
    <View style={[styles.presentationFrame, compact && styles.presentationFrameCompact]}>
      {kind === "dashboard" ? (
        <DashboardPreview />
      ) : (
        <Image
          source={source}
          style={styles.presentationImage}
          resizeMode="cover"
          accessibilityLabel="Aperçu réel de l'application MIZAN"
        />
      )}
    </View>
  );
}

// ─── SLIDE COMPONENT ─────────────────────────────────────────────────────────

function Slide({ item, index, scrollX }: { item: typeof SLIDES[0], index: number, scrollX: Animated.Value }) {
  const { isDark } = useTheme();
  const { height: viewportHeight } = useWindowDimensions();
  const compact = viewportHeight < 760;
  const veryCompact = viewportHeight < 680;
  
  const inputRange = [(index - 1) * W, index * W, (index + 1) * W];
  
  // Parallax offsets
  const txPhone = scrollX.interpolate({ inputRange, outputRange: [W * 0.5, 0, -W * 0.5], extrapolate: "clamp" });
  const txContent = scrollX.interpolate({ inputRange, outputRange: [W * 0.8, 0, -W * 0.8], extrapolate: "clamp" });
  const txFeatures = scrollX.interpolate({ inputRange, outputRange: [W * 1.1, 0, -W * 1.1], extrapolate: "clamp" });

  // Each slide has a gradient transitioning to deep navy for consistency across the app
  const gradientColors: [string, string] = isDark ? [item.color, "#070D1A"] : [item.color, "#0A1628"];

  return (
    <View style={{ width: W, height: H }}>
      <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
      <BgDeco color={item.color} />
      
      <View
        style={[
          styles.slideBody,
          compact && styles.slideBodyCompact,
          veryCompact && styles.slideBodyVeryCompact,
        ]}
      >
        
        {/* TOP ZONE (30%) */}
        <Animated.View style={[styles.topZone, compact && styles.topZoneCompact, veryCompact && styles.topZoneVeryCompact, { transform: [{ translateX: txPhone }] }]}>
          <View style={styles.topZoneHeader}>
            <View style={[styles.tagBadge, { backgroundColor: item.color }]}>
              <Text style={styles.tagText}>{item.tag}</Text>
            </View>
          </View>
          <PresentationImage source={item.image} compact={compact || veryCompact} kind={item.id} />
        </Animated.View>

        {/* CONTENT ZONE (40%) */}
        <Animated.View style={[styles.contentZone, compact && styles.contentZoneCompact, veryCompact && styles.contentZoneVeryCompact, { transform: [{ translateX: txContent }] }]}>
          <Text style={[styles.slideTitle, compact && styles.slideTitleCompact]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.slideSubtitle, compact && styles.slideSubtitleCompact]} numberOfLines={2}>{item.subtitle}</Text>
          
          <View style={[styles.kpiRow, compact && styles.kpiRowCompact]}>
            {item.kpis.map((kpi, kIdx) => (
              <View key={kIdx} style={[styles.kpiCard, compact && styles.kpiCardCompact]}>
                <Text style={styles.kpiValue}>{kpi.val}</Text>
                <Text style={styles.kpiLabel}>{kpi.lbl}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* FEATURES ZONE (30%) */}
        <Animated.View style={[styles.featuresZone, compact && styles.featuresZoneCompact, veryCompact && styles.featuresZoneVeryCompact, { transform: [{ translateX: txFeatures }] }]}>
          {item.features.map((feat, fIdx) => (
            <View key={fIdx} style={styles.featureRow}>
              <View style={[styles.featureCheck, { backgroundColor: item.color }]}>
                <Feather name="check" size={14} color="#FFF" />
              </View>
              <Text style={styles.featureText} numberOfLines={1}>{feat}</Text>
            </View>
          ))}
        </Animated.View>

      </View>
    </View>
  );
}

// ─── SCREEN MAIN ─────────────────────────────────────────────────────────────

export default function IntroScreen() {
  const scrollX = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: true,
      listener: (e: any) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / W);
        if (idx !== activeIndex) {
          setActiveIndex(idx);
          Haptics.selectionAsync();
        }
      }
    }
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        style={styles.introScroll}
        contentContainerStyle={styles.introScrollContent}
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((item, index) => (
          <Slide key={item.id} item={item} index={index} scrollX={scrollX} />
        ))}
      </Animated.ScrollView>

      {/* Back to the public presentation home */}
      <View style={[styles.backContainer, { top: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.replace("/welcome")}
          style={styles.backBtn}
          accessibilityLabel="Retour à l'accueil"
        >
          <Feather name="arrow-left" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Top Right Skip Button */}
      <View style={[styles.skipContainer, { top: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.replace("/get-started")} style={styles.skipBtn}>
          <Text style={styles.skipText}>Ignorer</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Pagination & Navigation */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.pagination}>
          {SLIDES.map((_, i) => {
            const opacity = scrollX.interpolate({
              inputRange: [(i - 1) * W, i * W, (i + 1) * W],
              outputRange: [0.3, 1, 0.3],
              extrapolate: "clamp",
            });
            const scale = scrollX.interpolate({
              inputRange: [(i - 1) * W, i * W, (i + 1) * W],
              outputRange: [0.8, 1.2, 0.8],
              extrapolate: "clamp",
            });
            return <Animated.View key={i} style={[styles.dot, { opacity, transform: [{ scale }] }]} />;
          })}
        </View>

        <TouchableOpacity 
          style={styles.nextBtn} 
          activeOpacity={0.8}
          onPress={() => {
             Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
             if (activeIndex < SLIDES.length - 1) {
               scrollViewRef.current?.scrollTo({ x: (activeIndex + 1) * W, animated: true });
             } else {
                router.replace("/get-started");
             }
          }}
        >
          <Text style={styles.nextText}>{activeIndex === SLIDES.length - 1 ? "Commencer" : "Suivant"}</Text>
          <Feather name={activeIndex === SLIDES.length - 1 ? "zap" : "arrow-right"} size={16} color="#0A1628" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#070D1A" },
  introScroll: { flex: 1, width: "100%" },
  introScrollContent: { flexGrow: 1 },

  slideBody: { flex: 1, paddingHorizontal: 24, paddingTop: Platform.OS === "ios" ? 80 : 60, paddingBottom: 120 },
  slideBodyCompact: { paddingHorizontal: 20, paddingTop: 62, paddingBottom: 108 },
  slideBodyVeryCompact: { paddingTop: 54, paddingBottom: 98 },
  topZone: { flex: 0, height: 270, alignItems: "center", justifyContent: "flex-start" },
  topZoneCompact: { height: 220 },
  topZoneVeryCompact: { height: 182 },
  topZoneHeader: { marginBottom: 10, alignItems: "center" },
  tagBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  tagText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#FFF", letterSpacing: 1.5 },
  presentationFrame: { width: 128, height: 220, borderRadius: 28, backgroundColor: "#071326", padding: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.32)", shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10, overflow: "hidden" },
  presentationFrameCompact: { width: 104, height: 174, borderRadius: 23, padding: 4 },
  presentationImage: { flex: 1, width: "100%", height: "100%", borderRadius: 23 },
  dashboardPreview: { flex: 1, borderRadius: 23, padding: 10, backgroundColor: "#0B327F", overflow: "hidden" },
  previewTopBar: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 12 },
  previewDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#35D39A" },
  previewDotBlue: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#70A9FF", marginLeft: "auto" },
  previewTopLine: { width: 44, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.78)" },
  previewHeroLine: { width: "78%", height: 8, borderRadius: 4, backgroundColor: "#FFFFFF", marginBottom: 5 },
  previewHeroLineShort: { width: "52%", height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.58)", marginBottom: 12 },
  previewKpiRow: { flexDirection: "row", gap: 6 },
  previewKpiCard: { flex: 1, height: 42, borderRadius: 8, padding: 7, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  previewKpiValue: { width: "42%", height: 7, borderRadius: 3, backgroundColor: "#FFFFFF", marginBottom: 5 },
  previewKpiValueGreen: { width: "55%", height: 7, borderRadius: 3, backgroundColor: "#65E5B1", marginBottom: 5 },
  previewKpiLabel: { width: "76%", height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.52)" },
  previewChart: { flex: 1, minHeight: 58, marginTop: 12, borderRadius: 9, padding: 8, flexDirection: "row", alignItems: "flex-end", gap: 5, backgroundColor: "rgba(3,18,60,0.2)" },
  previewBar: { flex: 1, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.36)" },
  previewLine: { position: "absolute", left: 8, right: 8, height: 2, borderRadius: 1, backgroundColor: "#65E5B1" },
  previewBottomRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  previewBottomPill: { flex: 1, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.35)" },
  previewBottomPillShort: { width: "24%", height: 7, borderRadius: 4, backgroundColor: "#65E5B1" },

  contentZone: { flex: 0, minHeight: 212, justifyContent: "center", paddingTop: 8 },
  contentZoneCompact: { minHeight: 174 },
  contentZoneVeryCompact: { minHeight: 154 },
  slideTitle: { fontFamily: "Inter_700Bold", fontSize: 30, color: "#FFF", letterSpacing: -0.5, lineHeight: 36 },
  slideTitleCompact: { fontSize: 27, lineHeight: 32 },
  slideSubtitle: { fontFamily: "Inter_400Regular", fontSize: 15, color: "rgba(255,255,255,0.7)", marginTop: 6, lineHeight: 21 },
  slideSubtitleCompact: { fontSize: 14, lineHeight: 19, marginTop: 4 },
  
  kpiRow: { flexDirection: "row", gap: 12, marginTop: 18 },
  kpiRowCompact: { gap: 8, marginTop: 14 },
  kpiCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  kpiCardCompact: { borderRadius: 12, padding: 10 },
  kpiValue: { fontFamily: "Inter_700Bold", fontSize: 21, color: "#FFF" },
  kpiLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 3 },

  featuresZone: { flex: 1, justifyContent: "flex-start", gap: 14, paddingTop: 8 },
  featuresZoneCompact: { gap: 9, paddingTop: 6 },
  featuresZoneVeryCompact: { gap: 7, paddingTop: 4 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureCheck: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  featureText: { fontFamily: "Inter_500Medium", fontSize: 15, color: "#FFF" },

  backContainer: { position: "absolute", left: 24, zIndex: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  skipContainer: { position: "absolute", right: 24, zIndex: 10 },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  skipText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFF" },

  bottomContainer: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24 },
  pagination: { flexDirection: "row", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFF" },

  nextBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF", paddingHorizontal: 20, paddingVertical: 14, borderRadius: 24 },
  nextText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#0A1628" },
});

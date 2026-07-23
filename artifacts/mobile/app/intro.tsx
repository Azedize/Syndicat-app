/**
 * VERIDIAN — Platform Introduction / Feature Onboarding
 *
 * 5-page carousel presenting the major capabilities of the platform.
 * Shown after the Welcome screen, before login.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle, Defs, LinearGradient as SvgGradient, Stop,
  Rect, Path, Ellipse, G, Line,
} from "react-native-svg";

import { useTheme } from "@/context/ThemeContext";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── SVG Illustrations ────────────────────────────────────────────────────────

function IllustrationDashboard({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "#0D1929" : "#EFF6FF";
  const card = isDark ? "#1E2D45" : "#fff";
  const bar = "#2563EB";
  const accent = "#F59E0B";
  return (
    <Svg width="220" height="180" viewBox="0 0 220 180">
      <Defs>
        <SvgGradient id="db1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3B82F6" stopOpacity="1" />
          <Stop offset="1" stopColor="#1D4ED8" stopOpacity="1" />
        </SvgGradient>
      </Defs>
      {/* Main card */}
      <Rect x="10" y="10" width="200" height="160" rx="16" fill={card} opacity="0.9" />
      {/* Header bar */}
      <Rect x="10" y="10" width="200" height="36" rx="16" fill="url(#db1)" />
      <Rect x="10" y="30" width="200" height="16" fill="url(#db1)" />
      <Circle cx="30" cy="28" r="8" fill="rgba(255,255,255,0.3)" />
      <Rect x="44" y="22" width="80" height="6" rx="3" fill="rgba(255,255,255,0.7)" />
      {/* KPI cards row */}
      {[0,1,2].map(i => (
        <G key={i}>
          <Rect x={20 + i*62} y="56" width="52" height="38" rx="8" fill={isDark ? "#243655" : "#F0F7FF"} />
          <Rect x={28 + i*62} y="64" width="24" height="4" rx="2" fill={isDark ? "rgba(255,255,255,0.3)" : "rgba(37,99,235,0.3)"} />
          <Rect x={28 + i*62} y="72" width="16" height="10" rx="2" fill={i === 1 ? accent : bar} opacity="0.9" />
        </G>
      ))}
      {/* Bar chart */}
      {[55, 80, 45, 95, 65, 75, 50].map((h, i) => (
        <Rect
          key={i}
          x={20 + i * 25}
          y={170 - h * 0.55}
          width="16"
          height={h * 0.55}
          rx="4"
          fill={i === 3 ? bar : (isDark ? "rgba(59,130,246,0.35)" : "rgba(37,99,235,0.25)")}
        />
      ))}
      {/* Trend line */}
      <Path d="M20,142 L45,128 L70,138 L95,115 L120,122 L145,110 L170,118 L195,105" stroke="#F59E0B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IllustrationGovernance({ isDark }: { isDark: boolean }) {
  const card = isDark ? "#1E2D45" : "#fff";
  const line = isDark ? "rgba(255,255,255,0.15)" : "rgba(37,99,235,0.15)";
  return (
    <Svg width="220" height="180" viewBox="0 0 220 180">
      <Defs>
        <SvgGradient id="gov1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2563EB" stopOpacity="0.15" />
          <Stop offset="1" stopColor="#1D4ED8" stopOpacity="0.05" />
        </SvgGradient>
      </Defs>
      {/* Document card */}
      <Rect x="30" y="10" width="160" height="160" rx="14" fill={card} opacity="0.95" />
      <Rect x="30" y="10" width="160" height="160" rx="14" fill="url(#gov1)" />
      {/* Document lines */}
      {[40, 54, 68, 82, 96].map(y => (
        <Rect key={y} x="50" y={y} width={y === 40 ? 90 : 110} height="6" rx="3" fill={line} />
      ))}
      {/* Signature line */}
      <Line x1="50" y1="120" x2="160" y2="120" stroke={isDark ? "rgba(245,158,11,0.5)" : "rgba(245,158,11,0.4)"} strokeWidth="1.5" strokeDasharray="4,3" />
      {/* Signature SVG path */}
      <Path d="M55,115 Q65,108 72,115 Q80,122 90,112 Q98,104 108,115" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Verified stamp */}
      <Circle cx="165" cy="145" r="22" fill="rgba(37,99,235,0.12)" stroke="#2563EB" strokeWidth="1.5" />
      <Path d="M157,145 L163,151 L173,139" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Participants row */}
      {[0,1,2,3].map(i => (
        <Circle key={i} cx={55 + i * 22} cy="148" r="9"
          fill={["#2563EB","#F59E0B","#10B981","#8B5CF6"][i]}
          opacity="0.9"
        />
      ))}
    </Svg>
  );
}

function IllustrationFinance({ isDark }: { isDark: boolean }) {
  const card = isDark ? "#1E2D45" : "#fff";
  return (
    <Svg width="220" height="180" viewBox="0 0 220 180">
      <Defs>
        <SvgGradient id="fin1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#10B981" stopOpacity="1" />
          <Stop offset="1" stopColor="#059669" stopOpacity="1" />
        </SvgGradient>
        <SvgGradient id="fin2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2563EB" stopOpacity="0.8" />
          <Stop offset="1" stopColor="#1D4ED8" stopOpacity="0.8" />
        </SvgGradient>
      </Defs>
      {/* Main gauge */}
      <Circle cx="110" cy="90" r="70" fill={card} opacity="0.9" />
      <Path d="M52,90 A58,58 0 0 1 168,90" stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(37,99,235,0.1)"} strokeWidth="12" fill="none" strokeLinecap="round" />
      <Path d="M52,90 A58,58 0 0 1 150,48" stroke="url(#fin1)" strokeWidth="12" fill="none" strokeLinecap="round" />
      {/* MAD label */}
      <Rect x="70" y="82" width="80" height="26" rx="8" fill="url(#fin2)" opacity="0.9" />
      <Rect x="78" y="88" width="50" height="6" rx="3" fill="rgba(255,255,255,0.8)" />
      <Rect x="78" y="97" width="32" height="4" rx="2" fill="rgba(255,255,255,0.5)" />
      {/* Small cards at bottom */}
      {[0,1,2].map(i => (
        <G key={i}>
          <Rect x={15 + i*65} y="148" width="58" height="26" rx="8" fill={card} opacity="0.9" />
          <Rect x={23 + i*65} y="154" width="28" height="4" rx="2" fill={isDark ? "rgba(255,255,255,0.2)" : "rgba(37,99,235,0.2)"} />
          <Rect x={23 + i*65} y="162" width="18" height="6" rx="3" fill={["#2563EB","#10B981","#F59E0B"][i]} opacity="0.9" />
        </G>
      ))}
    </Svg>
  );
}

function IllustrationMarketplace({ isDark }: { isDark: boolean }) {
  const card = isDark ? "#1E2D45" : "#fff";
  return (
    <Svg width="220" height="180" viewBox="0 0 220 180">
      <Defs>
        <SvgGradient id="mkt1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8B5CF6" stopOpacity="1" />
          <Stop offset="1" stopColor="#6D28D9" stopOpacity="1" />
        </SvgGradient>
      </Defs>
      {/* Store front */}
      <Rect x="15" y="20" width="190" height="50" rx="12" fill="url(#mkt1)" />
      <Rect x="30" y="32" width="80" height="7" rx="3.5" fill="rgba(255,255,255,0.8)" />
      <Rect x="30" y="44" width="50" height="5" rx="2.5" fill="rgba(255,255,255,0.5)" />
      {/* Shopping bag icon */}
      <Path d="M168,28 L168,38 M164,32 L172,32" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" />
      <Rect x="156" y="36" width="24" height="22" rx="5" fill="rgba(255,255,255,0.25)" />
      {/* Product cards */}
      {[0,1,2,3].map(i => (
        <G key={i}>
          <Rect x={15 + (i%2)*102} y={80 + Math.floor(i/2)*50} width="90" height="44" rx="10" fill={card} opacity="0.95" />
          <Rect x={22 + (i%2)*102} y={90 + Math.floor(i/2)*50} width="36" height="26" rx="6" fill={isDark ? "#243655" : "#EFF6FF"} />
          <Circle cx={40 + (i%2)*102} cy={103 + Math.floor(i/2)*50} r="8" fill={["#2563EB","#F59E0B","#10B981","#8B5CF6"][i]} opacity="0.7" />
          <Rect x={64 + (i%2)*102} y={90 + Math.floor(i/2)*50} width="32" height="5" rx="2.5" fill={isDark ? "rgba(255,255,255,0.2)" : "rgba(37,99,235,0.2)"} />
          <Rect x={64 + (i%2)*102} y={99 + Math.floor(i/2)*50} width="20" height="8" rx="4" fill="#2563EB" opacity="0.85" />
        </G>
      ))}
    </Svg>
  );
}

function IllustrationMaintenance({ isDark }: { isDark: boolean }) {
  const card = isDark ? "#1E2D45" : "#fff";
  return (
    <Svg width="220" height="180" viewBox="0 0 220 180">
      <Defs>
        <SvgGradient id="mnt1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F59E0B" stopOpacity="1" />
          <Stop offset="1" stopColor="#D97706" stopOpacity="1" />
        </SvgGradient>
        <SvgGradient id="mnt2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2563EB" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#1D4ED8" stopOpacity="0.9" />
        </SvgGradient>
      </Defs>
      {/* Status board */}
      <Rect x="10" y="10" width="200" height="160" rx="14" fill={card} opacity="0.9" />
      <Rect x="10" y="10" width="200" height="40" rx="14" fill="url(#mnt1)" />
      <Rect x="10" y="36" width="200" height="14" fill="url(#mnt1)" />
      <Rect x="24" y="22" width="70" height="7" rx="3.5" fill="rgba(255,255,255,0.85)" />
      {/* Ticket rows */}
      {[
        { status: "#10B981", label: "Ascenseur — En cours" },
        { status: "#F59E0B", label: "Toiture — Planifié" },
        { status: "#EF4444", label: "Plomberie — Urgent" },
        { status: "#2563EB", label: "Peinture — Terminé" },
      ].map((t, i) => (
        <G key={i}>
          <Rect x="20" y={62 + i * 25} width="180" height="20" rx="6" fill={isDark ? "#243655" : "#F8FAFF"} />
          <Circle cx="34" cy={72 + i * 25} r="5" fill={t.status} />
          <Rect x="46" y={69 + i * 25} width="80" height="5" rx="2.5" fill={isDark ? "rgba(255,255,255,0.3)" : "rgba(10,22,40,0.25)"} />
          <Rect x="164" y={68 + i * 25} width="26" height="8" rx="4" fill={t.status} opacity="0.25" />
        </G>
      ))}
      {/* Wrench icon */}
      <Circle cx="175" cy="28" r="12" fill="rgba(255,255,255,0.2)" />
      <Path d="M170,24 L175,29 L180,24 M175,29 L175,34" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// ─── Page data ────────────────────────────────────────────────────────────────

const PAGES = [
  {
    key: "syndicate",
    color: "#2563EB",
    gradient: ["#1E3A8A", "#2563EB"] as [string, string],
    icon: "layers" as const,
    title: "Gestion professionnelle\nde votre syndicat",
    subtitle: "Tout ce dont votre syndicat a besoin, dans une seule plateforme.",
    features: [
      { icon: "dollar-sign" as const, text: "Finance & budgets en temps réel" },
      { icon: "file-text" as const,   text: "Documents certifiés & archivés" },
      { icon: "users" as const,       text: "Assemblées générales digitales" },
      { icon: "bell" as const,        text: "Notifications & alertes" },
    ],
    Illustration: IllustrationDashboard,
  },
  {
    key: "governance",
    color: "#1D4ED8",
    gradient: ["#1E40AF", "#3B82F6"] as [string, string],
    icon: "award" as const,
    title: "Gouvernance\nnumérique",
    subtitle: "Pilotez vos réunions, décisions et signatures depuis votre téléphone.",
    features: [
      { icon: "calendar" as const,   text: "Gestion des réunions & PV" },
      { icon: "pen-tool" as const,   text: "Signature électronique" },
      { icon: "check-square" as const, text: "Approbations documentaires" },
      { icon: "git-branch" as const, text: "Workflows de décision" },
    ],
    Illustration: IllustrationGovernance,
  },
  {
    key: "finance",
    color: "#059669",
    gradient: ["#065F46", "#10B981"] as [string, string],
    icon: "bar-chart-2" as const,
    title: "Gestion\nfinancière avancée",
    subtitle: "Budgets, charges, paiements et recouvrement — tout automatisé.",
    features: [
      { icon: "pie-chart" as const,  text: "Budgets prévisionnels" },
      { icon: "credit-card" as const, text: "Charges & paiements en ligne" },
      { icon: "trending-up" as const, text: "Rapports financiers" },
      { icon: "alert-circle" as const, text: "Suivi des impayés" },
    ],
    Illustration: IllustrationFinance,
  },
  {
    key: "marketplace",
    color: "#7C3AED",
    gradient: ["#4C1D95", "#8B5CF6"] as [string, string],
    icon: "shopping-bag" as const,
    title: "Marketplace\nrésidents",
    subtitle: "Achetez, vendez et réservez en toute sécurité au sein de votre résidence.",
    features: [
      { icon: "tag" as const,        text: "Vente validée par le syndic" },
      { icon: "package" as const,    text: "Système de réservation" },
      { icon: "message-circle" as const, text: "Messagerie sécurisée" },
      { icon: "star" as const,       text: "Avis & évaluations" },
    ],
    Illustration: IllustrationMarketplace,
  },
  {
    key: "maintenance",
    color: "#D97706",
    gradient: ["#92400E", "#F59E0B"] as [string, string],
    icon: "tool" as const,
    title: "Maintenance\n& support",
    subtitle: "Tickets, incidents et prestataires gérés avec précision.",
    features: [
      { icon: "alert-triangle" as const, text: "Déclaration d'incidents" },
      { icon: "tool" as const,           text: "Bons de travaux" },
      { icon: "briefcase" as const,      text: "Gestion des prestataires" },
      { icon: "activity" as const,       text: "Suivi en temps réel" },
    ],
    Illustration: IllustrationMaintenance,
  },
];

// ─── Single page component ────────────────────────────────────────────────────

function IntroPage({ item, isDark, index }: { item: typeof PAGES[0]; isDark: boolean; index: number }) {
  const Illus = item.Illustration;
  const cardBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.85)";
  return (
    <View style={[styles.page, { width: SCREEN_W }]}>
      {/* Illustration */}
      <View style={styles.illustrationWrap}>
        <Illus isDark={isDark} />
      </View>

      {/* Page number badge */}
      <View style={[styles.pageNumBadge, { backgroundColor: item.color + "30", borderColor: item.color + "60" }]}>
        <Text style={[styles.pageNumText, { color: item.color }]}>{index + 1} / {PAGES.length}</Text>
      </View>

      {/* Title */}
      <Text style={[styles.pageTitle, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
        {item.title}
      </Text>
      <Text style={[styles.pageSub, { color: isDark ? "rgba(232,240,254,0.6)" : "#64748B" }]}>
        {item.subtitle}
      </Text>

      {/* Features */}
      <View style={[styles.featureCard, { backgroundColor: cardBg, borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(37,99,235,0.1)" }]}>
        {item.features.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: item.color + "20" }]}>
              <Feather name={f.icon} size={15} color={item.color} />
            </View>
            <Text style={[styles.featureText, { color: isDark ? "rgba(232,240,254,0.85)" : "#1E293B" }]}>
              {f.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const flatRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) {
      const idx = viewableItems[0].index;
      setCurrentIndex(idx);
      Animated.timing(progressAnim, {
        toValue: (idx + 1) / PAGES.length,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }).current;

  const goNext = () => {
    Haptics.selectionAsync();
    if (currentIndex < PAGES.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      Animated.timing(progressAnim, {
        toValue: (nextIndex + 1) / PAGES.length,
        duration: 300,
        useNativeDriver: false,
      }).start();
      flatRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    } else {
      router.push("/plans");
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      Animated.timing(progressAnim, {
        toValue: (prevIndex + 1) / PAGES.length,
        duration: 300,
        useNativeDriver: false,
      }).start();
      flatRef.current?.scrollToIndex({ index: prevIndex, animated: true });
    } else {
      router.back();
    }
  };

  const currentPage = PAGES[currentIndex];
  const isLast = currentIndex === PAGES.length - 1;
  const gradColors = isDark
    ? [currentPage.gradient[0] + "CC", "#070D1A"] as [string, string]
    : ["#F0F7FF", "#EFF6FF"] as [string, string];

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF" }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8) }]}>
        <TouchableOpacity onPress={() => router.replace("/welcome")} style={styles.backBtnTop}>
          <Feather name="arrow-left" size={20} color={isDark ? "#93C5FD" : "#2563EB"} />
        </TouchableOpacity>

        {/* Progress bar */}
        <View style={[styles.progressBg, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(37,99,235,0.15)" }]}>
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: currentPage.color, width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
            ]}
          />
        </View>

        <TouchableOpacity onPress={() => router.push("/get-started")} style={styles.skipBtn}>
          <Text style={[styles.skipText, { color: isDark ? "rgba(255,255,255,0.5)" : "#64748B" }]}>Passer</Text>
        </TouchableOpacity>
      </View>

      {/* Pages */}
      <FlatList
        ref={flatRef}
        data={PAGES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={true}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ item, index }) => (
          <IntroPage item={item} isDark={isDark} index={index} />
        )}
        style={{ flex: 1 }}
      />

      {/* Bottom navigation */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {/* Dots */}
        <View style={styles.dots}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: i === currentIndex ? 24 : 8,
                  backgroundColor: i === currentIndex ? currentPage.color : (isDark ? "rgba(255,255,255,0.2)" : "rgba(37,99,235,0.2)"),
                },
              ]}
            />
          ))}
        </View>

        {/* Nav buttons */}
        <View style={styles.navBtns}>
          <TouchableOpacity
            style={[styles.prevBtn, { borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(37,99,235,0.25)" }]}
            onPress={goPrev}
          >
            <Feather name="arrow-left" size={18} color={isDark ? "rgba(255,255,255,0.7)" : "#2563EB"} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: currentPage.color }]}
            onPress={goNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>{isLast ? "Voir les plans" : "Suivant"}</Text>
            <Feather name={isLast ? "tag" : "arrow-right"} size={17} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  backBtnTop: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  skipBtn: {
    paddingHorizontal: 4,
  },
  skipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },

  page: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: "center",
    gap: 14,
  },

  illustrationWrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  pageNumBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  pageNumText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.5,
  },

  pageTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    textAlign: "center",
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  pageSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  featureCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    flex: 1,
  },

  bottomBar: {
    paddingHorizontal: 24,
    gap: 16,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  navBtns: {
    flexDirection: "row",
    gap: 12,
  },
  prevBtn: {
    width: 48,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  nextBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
});

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
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop, Path } from "react-native-svg";

import MizanLogo from "@/components/brand/MizanLogo";
import { useTheme } from "@/context/ThemeContext";
import { crossPlatformShadow } from "@/lib/shadow";

// ─── Background decoration ────────────────────────────────────────────────────

function BGDecor({ isDark }: { isDark: boolean }) {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <SvgGradient id="gs1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B82F6" stopOpacity={isDark ? "0.15" : "0.1"} />
          <Stop offset="1" stopColor="#1D4ED8" stopOpacity="0.0" />
        </SvgGradient>
        <SvgGradient id="gs2" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#F59E0B" stopOpacity={isDark ? "0.1" : "0.08"} />
          <Stop offset="1" stopColor="#F59E0B" stopOpacity="0.0" />
        </SvgGradient>
      </Defs>
      <Circle cx="350" cy="100" r="240" fill="url(#gs1)" />
      <Circle cx="20" cy="750" r="200" fill="url(#gs2)" />
      
      {/* Decorative Hexagons representing network/nodes */}
      {[[60, 180], [130, 140], [200, 180], [270, 140], [340, 180], [95, 240], [165, 240], [235, 240], [305, 240]].map(([x, y], i) => (
        <Path
          key={i}
          d={`M${x},${y - 24} L${x + 20},${y - 12} L${x + 20},${y + 12} L${x},${y + 24} L${x - 20},${y + 12} L${x - 20},${y - 12} Z`}
          fill="none"
          stroke={isDark ? "rgba(59,130,246,0.12)" : "rgba(37,99,235,0.08)"}
          strokeWidth="1.5"
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
  const isPrimary = variant === "primary";
  const cardBg = isPrimary ? color : variant === "ghost" ? "transparent" : (isDark ? "#111D32" : "#FFFFFF");
  const borderColor = variant === "outline" ? color : (isDark ? "#1E3050" : "#E2E8F0");
  const textColor = isPrimary ? "#FFF" : (isDark ? "#E8F0FE" : "#0A1628");
  const subtextColor = isPrimary ? "rgba(255,255,255,0.7)" : (isDark ? "#7A90B0" : "#64748B");
  
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        {
          backgroundColor: cardBg,
          borderColor: borderColor,
          borderWidth: variant === "ghost" || isPrimary ? 0 : 1.5,
          ...crossPlatformShadow({
            color: isPrimary ? color : "#000",
            offsetY: isPrimary ? 6 : 1,
            opacity: isPrimary ? 0.35 : 0.05,
            radius: isPrimary ? 12 : 3,
            elevation: isPrimary ? 8 : (variant === "ghost" ? 0 : 2),
          }),
        },
      ]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.8}
    >
      <View style={[styles.actionIconWrap, { backgroundColor: isPrimary ? "rgba(255,255,255,0.2)" : (isDark ? "rgba(59,130,246,0.1)" : "rgba(37,99,235,0.08)") }]}>
        <Feather name={icon} size={20} color={isPrimary ? "#FFF" : color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, { color: textColor }]}>{label}</Text>
        {sublabel && (
          <Text style={[styles.actionSublabel, { color: subtextColor }]}>{sublabel}</Text>
        )}
      </View>
      <Feather name="chevron-right" size={20} color={isPrimary ? "rgba(255,255,255,0.8)" : (isDark ? "#4A6080" : "#CBD5E1")} />
    </TouchableOpacity>
  );
}

// No certification / SLA badges: MIZAN holds no ISO 27001 certification,
// its CNDP compliance and Moroccan hosting are not established, and no SLA
// exists. Such claims must not be shown until they are true and verified.

// ─── Testimonial card ─────────────────────────────────────────────────────────

function TestimonialCard({ isDark }: { isDark: boolean }) {
  return (
    <View style={[styles.testimonial, { backgroundColor: isDark ? "#111D32" : "#FFFFFF", borderColor: isDark ? "#1E3050" : "#E2E8F0" }]}>
      <View style={styles.testimonialStars}>
        {[1, 2, 3, 4, 5].map(i => (
          <Text key={i} style={{ color: "#F59E0B", fontSize: 18, lineHeight: 22 }}>★</Text>
        ))}
      </View>
      <Text style={[styles.testimonialText, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
         "MIZAN a transformé la gestion de notre résidence. Les assemblées générales en ligne et la signature électronique nous font gagner un temps précieux."
      </Text>
      <View style={styles.testimonialAuthor}>
        <View style={[styles.testimonialAvatar, { backgroundColor: "#F59E0B" }]}>
          <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 12 }}>KA</Text>
        </View>
        <View>
          <Text style={[styles.testimonialName, { color: isDark ? "#FFFFFF" : "#0A1628" }]}>Khalid Amrani</Text>
          <Text style={[styles.testimonialRole, { color: isDark ? "#7A90B0" : "#64748B" }]}>Syndic · Résidence Palmier, Casablanca</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GetStartedScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  const fadeAnim = useRef(new Animated.Value(Platform.OS === "web" ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(Platform.OS === "web" ? 0 : 30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, []);

  const gradColors: [string, string] = isDark ? ["#070D1A", "#0D1929"] : ["#F8FAFF", "#EFF6FF"];

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#070D1A" : "#F8FAFF" }]}>
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />
      <BGDecor isDark={isDark} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
          gap: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => router.replace("/welcome" as any)} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={isDark ? "#93C5FD" : "#2563EB"} />
        </TouchableOpacity>

        <Animated.View style={[styles.hero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <MizanLogo variant="icon" colorScheme={isDark ? "dark" : "light"} size={72} />
          <View style={{ alignItems: "center", gap: 8, marginTop: 24 }}>
            <Text style={[styles.heroTitle, { color: isDark ? "#FFFFFF" : "#0A1628" }]}>
              Prêt à commencer ?
            </Text>
            <Text style={[styles.heroSub, { color: isDark ? "#7A90B0" : "#64748B" }]}>
              Rejoignez les syndicats marocains les plus performants.
            </Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={[styles.sectionLabel, { color: isDark ? "#7A90B0" : "#64748B" }]}>DÉMARRER</Text>
          <View style={styles.actionList}>
            <ActionBtn
              variant="primary" icon="zap" label="Commencer gratuitement" sublabel="Essai 30 jours — aucune carte requise"
              onPress={() => router.push("/register")} color="#2563EB" isDark={isDark}
            />
            <ActionBtn
               variant="outline" icon="log-in" label="Se connecter" sublabel="J'ai déjà un compte MIZAN"
              onPress={() => router.replace("/login")} color="#3B82F6" isDark={isDark}
            />
          </View>
          {/* Sign-up creates a syndic (organisation) account. Residents are
              invited by their syndic, who creates their account. */}
          <View
            style={[
              styles.residentNote,
              { backgroundColor: isDark ? "#0F223D" : "#EFF6FF", borderColor: isDark ? "#1E3A5F" : "#BFDBFE" },
            ]}
          >
            <Feather name="info" size={16} color="#2563EB" />
            <Text style={[styles.residentNoteText, { color: isDark ? "#C7D2E4" : "#1E3A8A" }]}>
              Vous êtes copropriétaire ou locataire ? Vous n'avez pas besoin de créer de compte :
              votre syndic vous inscrit et vous recevez vos identifiants par email. Utilisez
              ensuite « Se connecter ».
            </Text>
          </View>
        </Animated.View>

        <TestimonialCard isDark={isDark} />

        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={[styles.sectionLabel, { color: isDark ? "#7A90B0" : "#64748B" }]}>AUTRES OPTIONS</Text>
          <View style={styles.actionList}>
            <ActionBtn
              variant="outline" icon="globe" label="Créer une organisation" sublabel="Enregistrer un nouveau syndicat"
              onPress={() => router.push("/register")} color="#7C3AED" isDark={isDark}
            />
            <ActionBtn
              variant="ghost" icon="phone" label="Contacter les ventes" sublabel="Pour les grandes résidences"
              onPress={() => Linking.openURL("mailto:sales@mizan.ma")} color="#10B981" isDark={isDark}
            />
            <ActionBtn
              variant="ghost" icon="monitor" label="Demander une démo" sublabel="Présentation personnalisée en ligne"
              onPress={() => Linking.openURL("mailto:demo@mizan.ma")} color="#D97706" isDark={isDark}
            />
          </View>
        </Animated.View>

        <TouchableOpacity
          onPress={() => router.push("/plans")}
          style={[styles.plansLink, { backgroundColor: isDark ? "rgba(59,130,246,0.1)" : "#EFF6FF", borderColor: isDark ? "rgba(59,130,246,0.3)" : "#BFDBFE" }]}
        >
          <Feather name="tag" size={16} color={isDark ? "#60A5FA" : "#2563EB"} />
          <Text style={[styles.plansLinkText, { color: isDark ? "#60A5FA" : "#2563EB" }]}>Voir les plans & tarifs</Text>
        </TouchableOpacity>

        <View style={{ gap: 16 }}>
          <Text style={[styles.sectionLabel, { textAlign: "center", color: isDark ? "#7A90B0" : "#64748B" }]}>SÉCURITÉ & CONFORMITÉ</Text>
        </View>

        <Text style={[styles.legalText, { color: isDark ? "#4A6080" : "#94A3B8" }]}>
           En créant un compte, vous acceptez les{" "}
          <Text style={{ color: isDark ? "#60A5FA" : "#2563EB" }}>Conditions d'utilisation</Text> et la{" "}
           <Text style={{ color: isDark ? "#60A5FA" : "#2563EB" }}>Politique de confidentialité</Text> de MIZAN.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  residentNote: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  residentNoteText: { flex: 1, fontSize: 13, lineHeight: 19 },
  root: { flex: 1 },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignSelf: "flex-start" },
  
  hero: { alignItems: "center", paddingVertical: 12 },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 26, letterSpacing: -0.5 },
  heroSub: { fontFamily: "Inter_400Regular", fontSize: 16, textAlign: "center" },

  section: { gap: 16 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase" },
  actionList: { gap: 12 },

  actionBtn: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 16, gap: 16 },
  actionIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  actionSublabel: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },

  testimonial: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 16, ...crossPlatformShadow({ color: "#000", offsetY: 4, opacity: 0.03, radius: 10, elevation: 3 }) },
  testimonialStars: { flexDirection: "row", gap: 4 },
  testimonialText: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 24, fontStyle: "italic" },
  testimonialAuthor: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  testimonialAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  testimonialName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  testimonialRole: { fontFamily: "Inter_400Regular", fontSize: 13 },

  plansLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, borderWidth: 1, paddingVertical: 18 },
  plansLinkText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },

  certStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  certItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  certLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  legalText: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", lineHeight: 20 },
});
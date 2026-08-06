import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest } from "@/lib/api";

export interface BadgeData {
  badgeId: string;
  userId: string;
  name: string;
  role: "super_admin" | "syndicate_admin" | "member" | "tenant";
  roleLabel: string;
  avatar: string | null;
  cin: string | null;
  phone: string | null;
  email: string;
  status: "active" | "inactive";
  syndicateName: string | null;
  buildingName: string | null;
  lotNumber: string | null;
  lotFloor: number | null;
  issueDate: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  verifyUrl: string;
}

type RoleTheme = {
  gradient: [string, string];
  accent: string;
  textOnGradient: string;
  icon: keyof typeof Feather.glyphMap;
  styleLabelKey: string;
};

const ROLE_THEMES: Record<BadgeData["role"], RoleTheme> = {
  super_admin: {
    gradient: ["#111827", "#1f2937"],
    accent: "#d4af37",
    textOnGradient: "#f5f0e0",
    icon: "award",
    styleLabelKey: "badgeStyleExecutive",
  },
  syndicate_admin: {
    gradient: ["#4c1d95", "#2563EB"],
    accent: "#e9d5ff",
    textOnGradient: "#ffffff",
    icon: "briefcase",
    styleLabelKey: "badgeStyleManagement",
  },
  member: {
    gradient: ["#065f46", "#10b981"],
    accent: "#d1fae5",
    textOnGradient: "#ffffff",
    icon: "home",
    styleLabelKey: "badgeStyleResident",
  },
  tenant: {
    gradient: ["#1e3a8a", "#3b82f6"],
    accent: "#dbeafe",
    textOnGradient: "#ffffff",
    icon: "key",
    styleLabelKey: "badgeStyleTenant",
  },
};

function formatDate(iso: string | null, lang: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-MA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function verificationCode(badgeId: string): string {
  // Deterministic short code derived from the real badge id — not random —
  // so it's stable and can be manually cross-checked against the QR value.
  let hash = 0;
  for (let i = 0; i < badgeId.length; i++) {
    hash = (hash * 31 + badgeId.charCodeAt(i)) & 0xffffffff;
  }
  const code = Math.abs(hash).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export default function BadgeCard() {
  const { user, token } = useAuth();
  const { t, lang, isRTL } = useLanguage();
  const [badge, setBadge] = useState<BadgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    apiRequest<{ data: BadgeData }>("/badge/me")
      .then(({ data }) => setBadge(data))
      .catch(() => setBadge(null))
      .finally(() => setLoading(false));
  }, []);

  const flip = () => {
    Animated.spring(spin, {
      toValue: flipped ? 0 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 10,
    }).start();
    setFlipped(!flipped);
  };

  const frontInterpolate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backInterpolate = spin.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  if (!badge || !user) {
    return (
      <View style={styles.loadingBox}>
        <Feather name="alert-triangle" size={20} color="#ef4444" />
        <Text style={styles.errorText}>{t("badgeLoadError")}</Text>
      </View>
    );
  }

  const theme = ROLE_THEMES[badge.role] ?? ROLE_THEMES.member;
  const initials = badge.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const isActive = badge.status === "active";
  const locationLine = [badge.buildingName, badge.lotNumber ? `Lot ${badge.lotNumber}` : null].filter(Boolean).join(" · ");

  return (
    <View style={styles.wrap}>
      <View style={styles.cardStack}>
        {/* FRONT */}
        <Animated.View style={[styles.face, { transform: [{ rotateY: frontInterpolate }] }]}>
          <LinearGradient colors={theme.gradient} style={styles.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={[styles.brandRow, isRTL && styles.rowRTL]}>
              <View style={styles.brandMarkWrap}>
                <Feather name="shield" size={13} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.brandName, { color: theme.textOnGradient }]}>MIZAN</Text>
                <Text style={[styles.brandTagline, { color: theme.accent }]}>{t("badgeOfficialId")}</Text>
              </View>
              <View style={[styles.roleChip, { borderColor: theme.accent }]}>
                <Feather name={theme.icon} size={11} color={theme.accent} />
                <Text style={[styles.roleChipText, { color: theme.accent }]}>{t(theme.styleLabelKey)}</Text>
              </View>
            </View>

            <View style={[styles.identityRow, isRTL && styles.rowRTL]}>
              {badge.avatar ? (
                <Image source={{ uri: badge.avatar }} style={styles.photo} />
              ) : (
                <View style={[styles.photoFallback, { borderColor: theme.accent }]}>
                  <Text style={[styles.photoInitials, { color: theme.textOnGradient }]}>{initials}</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.name, { color: theme.textOnGradient }]} numberOfLines={1}>{badge.name}</Text>
                <Text style={[styles.roleLabel, { color: theme.accent }]}>{badge.roleLabel}</Text>
                {badge.syndicateName ? (
                  <Text style={[styles.metaLine, { color: theme.textOnGradient }]} numberOfLines={1}>{badge.syndicateName}</Text>
                ) : null}
                {locationLine ? (
                  <Text style={[styles.metaLine, { color: theme.textOnGradient, opacity: 0.85 }]} numberOfLines={1}>{locationLine}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.divider} />

            <View style={[styles.footerRow, isRTL && styles.rowRTL]}>
              <View style={{ gap: 6, flex: 1 }}>
                <View style={[styles.statusPill, { backgroundColor: isActive ? "rgba(74,222,128,0.18)" : "rgba(248,113,113,0.2)" }]}>
                  <View style={[styles.statusDot, { backgroundColor: isActive ? "#4ade80" : "#f87171" }]} />
                  <Text style={[styles.statusText, { color: isActive ? "#4ade80" : "#f87171" }]}>
                    {isActive ? t("badgeStatusActive") : t("badgeStatusSuspended")}
                  </Text>
                </View>
                <Text style={[styles.badgeIdText, { color: theme.accent }]}>{badge.badgeId}</Text>
                <Text style={[styles.issueText, { color: theme.textOnGradient, opacity: 0.7 }]}>
                  {t("badgeIssued")} {formatDate(badge.issueDate, lang)}
                </Text>
              </View>
              <View style={styles.qrWrap}>
                <QRCode value={badge.verifyUrl} size={64} backgroundColor="#ffffff" color="#111827" />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* BACK */}
        <Animated.View style={[styles.face, styles.faceBack, { transform: [{ rotateY: backInterpolate }] }]}>
          <LinearGradient colors={theme.gradient} style={styles.gradient} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}>
            <Text style={[styles.backTitle, { color: theme.textOnGradient }]}>{t("badgeVerification")}</Text>

            <View style={styles.backQrRow}>
              <View style={styles.qrWrapLarge}>
                <QRCode value={badge.verifyUrl} size={92} backgroundColor="#ffffff" color="#111827" />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <View>
                  <Text style={[styles.backLabel, { color: theme.accent }]}>{t("badgeVerificationCode")}</Text>
                  <Text style={[styles.backCode, { color: theme.textOnGradient }]}>{verificationCode(badge.badgeId)}</Text>
                </View>
                <View>
                  <Text style={[styles.backLabel, { color: theme.accent }]}>{t("badgeSupportContact")}</Text>
                  <Text style={[styles.backValue, { color: theme.textOnGradient }]}>support@mizan.ma</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            {(badge.emergencyContact || badge.emergencyPhone || badge.phone) ? (
              <View style={{ gap: 2 }}>
                <Text style={[styles.backLabel, { color: theme.accent }]}>{t("badgeEmergencyContact")}</Text>
                <Text style={[styles.backValue, { color: theme.textOnGradient }]}>
                  {badge.emergencyContact ?? badge.name} · {badge.emergencyPhone ?? badge.phone ?? "—"}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.terms, { color: theme.textOnGradient, opacity: 0.75 }]} numberOfLines={3}>
              {t("badgeTermsOfUse")}
            </Text>
          </LinearGradient>
        </Animated.View>
      </View>

      <TouchableOpacity style={styles.flipHint} onPress={flip} activeOpacity={0.7}>
        <Feather name="rotate-cw" size={13} color="#2563EB" />
        <Text style={styles.flipHintText}>{flipped ? t("badgeFlipFront") : t("badgeFlipBack")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const CARD_HEIGHT = 226;

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12 },
  cardStack: { width: "100%", maxWidth: 380, height: CARD_HEIGHT },
  loadingBox: { alignItems: "center", justifyContent: "center", height: CARD_HEIGHT, gap: 8 },
  errorText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#ef4444" },
  face: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 22,
    backfaceVisibility: "hidden",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  faceBack: {},
  gradient: { flex: 1, padding: 18, justifyContent: "space-between" },
  rowRTL: { flexDirection: "row-reverse" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMarkWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 11.5, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  brandTagline: { fontSize: 9, fontFamily: "Inter_500Medium", marginTop: 1 },
  roleChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  roleChipText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  photo: { width: 58, height: 58, borderRadius: 16 },
  photoFallback: { width: 58, height: 58, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  photoInitials: { fontSize: 20, fontFamily: "Inter_700Bold" },
  name: { fontSize: 17, fontFamily: "Inter_700Bold" },
  roleLabel: { fontSize: 11.5, fontFamily: "Inter_600SemiBold" },
  metaLine: { fontSize: 11, fontFamily: "Inter_400Regular" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.18)" },
  footerRow: { flexDirection: "row", alignItems: "flex-end" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  badgeIdText: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  issueText: { fontSize: 9.5, fontFamily: "Inter_400Regular" },
  qrWrap: { padding: 6, backgroundColor: "#fff", borderRadius: 10 },
  qrWrapLarge: { padding: 8, backgroundColor: "#fff", borderRadius: 12 },
  backTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  backQrRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  backLabel: { fontSize: 9.5, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4 },
  backCode: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 1, marginTop: 2 },
  backValue: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  terms: { fontSize: 9, fontFamily: "Inter_400Regular", lineHeight: 13 },
  flipHint: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: "#2563EB12" },
  flipHintText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#2563EB" },
});

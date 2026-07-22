/**
 * VERIDIAN — Enterprise Authentication Screen
 *
 * Premium SaaS login experience inspired by Microsoft 365, Adobe Sign, and Stripe.
 * Dark navy theme. Fortune 500 enterprise credibility.
 *
 * Design system:
 *   — Background: #070D1A deep navy + subtle radial gradient
 *   — Login card: elevated glass surface with blue-tinted border glow
 *   — KPI badges: gold-accented enterprise metrics row
 *   — Trust grid: 6-item SSL/RGPD credibility block
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import VeridianLogo from "@/components/brand/VeridianLogo";

// ─── Brand tokens (always dark on this screen) ──────────────────────────────

const B = {
  bg:           "#070D1A",
  card:         "#0D1929",
  cardBorder:   "#1E3A5F",
  cardGlow:     "rgba(37,99,235,0.18)",
  primary:      "#2563EB",
  primaryDark:  "#1E40AF",
  gold:         "#F59E0B",
  goldDim:      "rgba(245,158,11,0.12)",
  white:        "#FFFFFF",
  blue100:      "#E8F0FE",
  blue300:      "#93C5FD",
  blue400:      "#60A5FA",
  muted:        "#7A90B0",
  mutedDim:     "rgba(122,144,176,0.12)",
  error:        "#F87171",
  errorDim:     "rgba(248,113,113,0.10)",
  navy:         "#0A1628",
  divider:      "rgba(255,255,255,0.06)",
  inputBg:      "#0A1A2E",
  inputBorder:  "#1E3050",
  inputFocus:   "rgba(37,99,235,0.45)",
} as const;

// ─── Demo roles ──────────────────────────────────────────────────────────────

function useRoles(t: (key: string) => string) {
  return [
    { role: "syndicate_admin" as UserRole, label: t("syndicateAdmin"), icon: "briefcase" as const, email: "syndic@veridian.app" },
    { role: "president"       as UserRole, label: t("rolePresident"),  icon: "award"     as const, email: "president@andalous.ma" },
    { role: "treasurer"       as UserRole, label: t("roleTresorier"),  icon: "bar-chart-2" as const, email: "tresorier@andalous.ma" },
    { role: "secretary"       as UserRole, label: t("roleSecrétaire"), icon: "file-text" as const, email: "secretaire@andalous.ma" },
    { role: "member"          as UserRole, label: t("member"),         icon: "user"      as const, email: "omar.benali@gmail.com" },
    { role: "super_admin"     as UserRole, label: t("superAdmin"),     icon: "shield"    as const, email: "admin@veridian.app" },
  ];
}

// ─── KPI Badges ─────────────────────────────────────────────────────────────

const KPI_ITEMS = [
  { icon: "home"       as const, value: "120+",  label: "Copropriétés" },
  { icon: "file-text"  as const, value: "32",    label: "Modèles docs" },
  { icon: "pen-tool"   as const, value: "∞",     label: "Signatures" },
  { icon: "users"      as const, value: "8",     label: "Rôles métier" },
  { icon: "shield"     as const, value: "100%",  label: "Conformité" },
] as const;

// ─── Trust Items ─────────────────────────────────────────────────────────────

const TRUST_ITEMS = [
  { icon: "lock"       as const, label: "SSL 256 bits" },
  { icon: "file-text"  as const, label: "Documents certifiés" },
  { icon: "pen-tool"   as const, label: "Signature électronique" },
  { icon: "shield"     as const, label: "Conformité RGPD" },
  { icon: "activity"   as const, label: "Audit complet" },
  { icon: "eye"        as const, label: "Traçabilité totale" },
] as const;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login }  = useAuth();
  const { t }      = useLanguage();
  const ROLES      = useRoles(t);

  const [selectedRole, setSelectedRole] = useState<UserRole>("syndicate_admin");
  const [email,        setEmail]        = useState(__DEV__ ? "syndic@andalous.ma" : "");
  const [password,     setPassword]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused,  setPassFocused]  = useState(false);

  const handleSelectRole = (r: typeof ROLES[number]) => {
    setSelectedRole(r.role);
    setEmail(r.email);
    setError("");
    Haptics.selectionAsync();
  };

  const handleLogin = async () => {
    if (!email.trim())   { setError(t("emailRequired"));    return; }
    if (!password)       { setError(t("passwordRequired")); return; }
    if (password.length < 6) { setError(t("passwordTooShort")); return; }
    setLoading(true);
    setError("");
    const ok = await login(email, password);
    setLoading(false);
    if (!ok) {
      setError(t("invalidCredentials"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)/" as any);
    }
  };

  return (
    <View style={styles.root}>
      {/* Background gradient — deep navy → slightly lighter at centre */}
      <LinearGradient
        colors={["#0A1628", "#070D1A", "#070D1A"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle top-centre radial accent */}
      <View style={styles.radialAccent} pointerEvents="none" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── HEADER: Brand area ───────────────────────────────────── */}
          <View style={styles.header}>
            {/* Logo — horizontal variant for enterprise authority */}
            <VeridianLogo
              variant="horizontal"
              colorScheme="dark"
              size={52}
              showTagline
            />

            {/* Premium tagline */}
            <View style={styles.taglineRow}>
              <View style={styles.taglineDivider} />
              <Text style={styles.tagline}>
                Gestion intelligente des syndicats, finances, documents et gouvernance.
              </Text>
              <View style={styles.taglineDivider} />
            </View>
          </View>

          {/* ── HERO: KPI badges ─────────────────────────────────────── */}
          <View style={styles.kpiRow}>
            {KPI_ITEMS.map((k) => (
              <View key={k.label} style={styles.kpiBadge}>
                <View style={styles.kpiIconWrap}>
                  <Feather name={k.icon} size={13} color={B.gold} />
                </View>
                <Text style={styles.kpiValue}>{k.value}</Text>
                <Text style={styles.kpiLabel}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* ── LOGIN CARD ───────────────────────────────────────────── */}
          <View style={styles.card}>
            {/* Card glow border */}
            <View style={styles.cardGlowRing} pointerEvents="none" />

            {/* Card header */}
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.cardTitleBadge}>
                  <Feather name="lock" size={11} color={B.primary} />
                </View>
                <View>
                  <Text style={styles.cardTitle}>{t("login")}</Text>
                  <Text style={styles.cardSubtitle}>Accès sécurisé à votre espace syndic</Text>
                </View>
              </View>
              {/* Enterprise "Secure" badge */}
              <View style={styles.secureBadge}>
                <Feather name="shield" size={10} color={B.blue400} />
                <Text style={styles.secureBadgeText}>Sécurisé</Text>
              </View>
            </View>

            <View style={styles.cardDivider} />

            {/* Role selector — compact pills */}
            <View style={styles.roleSection}>
              <Text style={styles.roleLabel}>{t("selectRole")}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.roleScroll}
              >
                {ROLES.map((r) => {
                  const active = selectedRole === r.role;
                  return (
                    <TouchableOpacity
                      key={r.role}
                      style={[styles.rolePill, active && styles.rolePillActive]}
                      onPress={() => handleSelectRole(r)}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name={r.icon}
                        size={12}
                        color={active ? B.white : B.blue300}
                      />
                      <Text style={[styles.rolePillText, active && styles.rolePillTextActive]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Email field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t("email")}</Text>
              <View style={[
                styles.inputWrap,
                emailFocused && styles.inputWrapFocused,
              ]}>
                <Feather name="mail" size={15} color={emailFocused ? B.blue400 : B.muted} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t("emailPlaceholder")}
                  placeholderTextColor={B.muted}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
              </View>
            </View>

            {/* Password field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t("password")}</Text>
              <View style={[
                styles.inputWrap,
                passFocused && styles.inputWrapFocused,
              ]}>
                <Feather name="lock" size={15} color={passFocused ? B.blue400 : B.muted} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder={t("passwordPlaceholder")}
                  placeholderTextColor={B.muted}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                />
                <TouchableOpacity onPress={() => setShowPassword((p) => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={15}
                    color={B.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot password link */}
            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => router.push("/forgot-password")}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotText}>{t("forgotPassword")}</Text>
            </TouchableOpacity>

            {/* Error message */}
            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={13} color={B.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* CTA button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              style={styles.ctaOuter}
            >
              <LinearGradient
                colors={loading
                  ? ["rgba(30,64,175,0.5)", "rgba(37,99,235,0.5)"]
                  : ["#1E40AF", "#2563EB"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cta}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={styles.ctaText}>{t("connect")}</Text>
                    <Feather name="arrow-right" size={17} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Demo note */}
            <Text style={styles.demoNote}>{t("demoMode")}</Text>
          </View>

          {/* ── TRUST SECTION ────────────────────────────────────────── */}
          <View style={styles.trustSection}>
            <View style={styles.trustHeader}>
              <View style={styles.trustHeaderLine} />
              <Text style={styles.trustHeaderLabel}>Plateforme certifiée entreprise</Text>
              <View style={styles.trustHeaderLine} />
            </View>

            <View style={styles.trustGrid}>
              {TRUST_ITEMS.map((item) => (
                <View key={item.label} style={styles.trustItem}>
                  <View style={styles.trustIconWrap}>
                    <Feather name={item.icon} size={13} color={B.blue400} />
                  </View>
                  <Text style={styles.trustLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── FOOTER ───────────────────────────────────────────────── */}
          <Text style={styles.footer}>
            © 2026 VERIDIAN · Tous droits réservés · v2.0
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  // ── Root ──
  root: {
    flex: 1,
    backgroundColor: B.bg,
  },

  // ── Radial accent behind header ──
  radialAccent: {
    position: "absolute",
    top: -80,
    alignSelf: "center",
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "rgba(37,99,235,0.07)",
  },

  scroll: {
    paddingHorizontal: 20,
    gap: 20,
  },

  // ── Header ──
  header: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 8,
  },
  taglineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
  },
  taglineDivider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(37,99,235,0.25)",
  },
  tagline: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: B.muted,
    textAlign: "center",
    flex: 3,
    letterSpacing: 0.1,
    lineHeight: 15,
  },

  // ── KPI badges ──
  kpiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  kpiBadge: {
    flex: 1,
    alignItems: "center",
    backgroundColor: B.mutedDim,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 4,
  },
  kpiIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: B.goldDim,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: B.gold,
    letterSpacing: -0.3,
  },
  kpiLabel: {
    fontSize: 8.5,
    fontFamily: "Inter_400Regular",
    color: B.muted,
    textAlign: "center",
    letterSpacing: 0.1,
  },

  // ── Card ──
  card: {
    backgroundColor: B.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: B.cardBorder,
    padding: 22,
    gap: 16,
    // Multi-layer elevation
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 20,
    position: "relative",
    overflow: "hidden",
  },
  cardGlowRing: {
    position: "absolute",
    top: -1,
    left: -1,
    right: -1,
    height: 2,
    backgroundColor: "rgba(37,99,235,0.5)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },

  // Card header row
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardTitleBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(37,99,235,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.25)",
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: B.white,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    color: B.muted,
    marginTop: 1,
  },
  secureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(96,165,250,0.08)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.2)",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  secureBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: B.blue400,
    letterSpacing: 0.2,
  },

  cardDivider: {
    height: 1,
    backgroundColor: B.divider,
    marginHorizontal: -22,
  },

  // Role selector
  roleSection: { gap: 8 },
  roleLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: B.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  roleScroll: {
    gap: 6,
    paddingRight: 2,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.18)",
    backgroundColor: "rgba(147,197,253,0.06)",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  rolePillActive: {
    backgroundColor: B.primary,
    borderColor: B.primary,
    shadowColor: B.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  rolePillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: B.blue300,
  },
  rolePillTextActive: {
    color: B.white,
  },

  // Form fields
  fieldGroup: { gap: 7 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: B.blue100,
    letterSpacing: 0.1,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: B.inputBg,
    borderWidth: 1.5,
    borderColor: B.inputBorder,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  inputWrapFocused: {
    borderColor: B.primary,
    shadowColor: B.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: B.white,
  },

  // Forgot
  forgotRow: {
    alignItems: "flex-end",
    marginTop: -6,
  },
  forgotText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: B.blue400,
  },

  // Error
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: B.errorDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.2)",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: B.error,
    lineHeight: 17,
  },

  // CTA
  ctaOuter: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: B.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
    borderRadius: 14,
  },
  ctaText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: B.white,
    letterSpacing: 0.2,
  },

  // Demo note
  demoNote: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    color: "rgba(122,144,176,0.55)",
    textAlign: "center",
    lineHeight: 15,
  },

  // ── Trust section ──
  trustSection: {
    gap: 14,
  },
  trustHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trustHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  trustHeaderLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "rgba(122,144,176,0.6)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  trustGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  trustItem: {
    width: "30.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  trustIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "rgba(96,165,250,0.1)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  trustLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
    color: B.muted,
    flex: 1,
    lineHeight: 13,
  },

  // ── Footer ──
  footer: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(122,144,176,0.35)",
    textAlign: "center",
    letterSpacing: 0.2,
  },
});

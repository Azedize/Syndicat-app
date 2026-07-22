/**
 * VERIDIAN — Enterprise Authentication Screen v3
 *
 * Production SaaS login experience.
 * Inspired by Microsoft 365, Salesforce, SAP Fiori, Oracle Cloud, Stripe, Adobe Sign.
 *
 * Design principles:
 *   — Deep navy / indigo brand palette — NOT generic white
 *   — Full dark ↔ light mode with system detection & persisted preference
 *   — Hero feature tiles: 8 enterprise capabilities in a 2-col grid
 *   — Trust section: 6 certification indicators
 *   — Zero demo artifacts: no role selector, no pre-filled hints
 *   — Role resolved server-side after authentication
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import VeridianLogo from "@/components/brand/VeridianLogo";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

// ─── Feature tiles ───────────────────────────────────────────────────────────

const FEATURES: { icon: React.ComponentProps<typeof Feather>["name"]; label: string }[] = [
  { icon: "home",          label: "Gestion des\ncopropriétés"  },
  { icon: "users",         label: "Assemblées\ngénérales"       },
  { icon: "file-text",     label: "Documents\ncertifiés"        },
  { icon: "pen-tool",      label: "Signature\nélectronique"     },
  { icon: "bar-chart-2",   label: "Finances\n& budgets"         },
  { icon: "tool",          label: "Maintenance\n& travaux"      },
  { icon: "alert-circle",  label: "Réclamations\n& incidents"   },
  { icon: "bell",          label: "Notifications\n& alertes"    },
];

// ─── Trust items ─────────────────────────────────────────────────────────────

const TRUST: { icon: React.ComponentProps<typeof Feather>["name"]; label: string }[] = [
  { icon: "lock",       label: "SSL 256 bits"           },
  { icon: "shield",     label: "Conformité RGPD"        },
  { icon: "file-text",  label: "Documents certifiés"    },
  { icon: "activity",   label: "Audit complet"          },
  { icon: "eye",        label: "Traçabilité totale"     },
  { icon: "pen-tool",   label: "Signature électronique" },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const insets             = useSafeAreaInsets();
  const { login }          = useAuth();
  const { t }              = useLanguage();
  const { isDark, toggle } = useTheme();

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused,  setPassFocused]  = useState(false);

  // Resolved palette
  const P = isDark ? DARK : LIGHT;

  const handleLogin = async () => {
    if (!email.trim())       { setError(t("emailRequired"));    return; }
    if (!password)           { setError(t("passwordRequired")); return; }
    if (password.length < 6) { setError(t("passwordTooShort")); return; }
    setLoading(true);
    setError("");
    try {
      const ok = await login(email, password);
      if (!ok) {
        setError(t("invalidCredentials"));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)/" as any);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: P.pageBg }]}>

      {/* ── Theme toggle (absolute, top-right) ───────────────────────── */}
      <View style={[s.toggleWrap, { top: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={toggle}
          activeOpacity={0.75}
          style={[s.toggleBtn, { backgroundColor: P.toggleBg, borderColor: P.border }]}
        >
          <Feather name={isDark ? "sun" : "moon"} size={16} color={P.toggleIcon} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={s.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={[
            s.scroll,
            { paddingTop: insets.top + 52, paddingBottom: insets.bottom + 48 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── BRAND HEADER ─────────────────────────────────────── */}
          <View style={s.brandArea}>
            <VeridianLogo
              variant="icon"
              colorScheme={isDark ? "dark" : "light"}
              size={80}
            />
            <Text style={[s.appName, { color: P.textPrimary }]}>VERIDIAN</Text>
            <Text style={[s.appTagline, { color: P.textMuted }]}>
              Enterprise Property {"&"} Syndicate Management Platform
            </Text>
          </View>

          {/* ── ENTERPRISE FEATURE TILES ─────────────────────────── */}
          <View style={s.section}>
            <Text style={[s.sectionLabel, { color: P.sectionLabel }]}>
              Fonctionnalités entreprise
            </Text>
            <View style={s.tilesGrid}>
              {FEATURES.map((f) => (
                <View
                  key={f.label}
                  style={[
                    s.tile,
                    {
                      backgroundColor: P.featureBg,
                      borderColor: P.border,
                    },
                  ]}
                >
                  <View style={[s.tileIconWrap, { backgroundColor: P.iconBg }]}>
                    <Feather name={f.icon} size={16} color={P.accent} />
                  </View>
                  <Text style={[s.tileLabel, { color: P.featureLabel }]} numberOfLines={3}>
                    {f.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── LOGIN CARD ───────────────────────────────────────── */}
          <View style={[s.card, { backgroundColor: P.card, borderColor: P.cardBorder }]}>
            {/* Top accent bar */}
            <View style={[s.cardAccent, { backgroundColor: P.accent }]} />

            <View style={s.cardBody}>
              {/* Headline */}
              <View style={s.cardHead}>
                <Text style={[s.welcomeTitle, { color: P.textPrimary }]}>Bon retour</Text>
                <Text style={[s.welcomeSub, { color: P.textSecond }]}>
                  Accédez à votre espace de gestion sécurisé
                </Text>
              </View>

              <View style={[s.divider, { backgroundColor: P.divider }]} />

              {/* Email */}
              <View style={s.field}>
                <Text style={[s.fieldLabel, { color: P.label }]}>{t("email")}</Text>
                <View
                  style={[
                    s.inputRow,
                    {
                      backgroundColor: P.inputBg,
                      borderColor: emailFocused ? P.accent : P.inputBorder,
                    },
                  ]}
                >
                  <Feather
                    name="mail"
                    size={16}
                    color={emailFocused ? P.accent : P.textMuted}
                  />
                  <TextInput
                    style={[s.input, { color: P.textPrimary }]}
                    value={email}
                    onChangeText={(v) => { setEmail(v); setError(""); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    placeholder={t("emailPlaceholder")}
                    placeholderTextColor={P.textMuted}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Password */}
              <View style={s.field}>
                <Text style={[s.fieldLabel, { color: P.label }]}>{t("password")}</Text>
                <View
                  style={[
                    s.inputRow,
                    {
                      backgroundColor: P.inputBg,
                      borderColor: passFocused ? P.accent : P.inputBorder,
                    },
                  ]}
                >
                  <Feather
                    name="lock"
                    size={16}
                    color={passFocused ? P.accent : P.textMuted}
                  />
                  <TextInput
                    style={[s.input, { color: P.textPrimary }]}
                    value={password}
                    onChangeText={(v) => { setPassword(v); setError(""); }}
                    secureTextEntry={!showPassword}
                    placeholder={t("passwordPlaceholder")}
                    placeholderTextColor={P.textMuted}
                    onFocus={() => setPassFocused(true)}
                    onBlur={() => setPassFocused(false)}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((p) => !p)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Feather
                      name={showPassword ? "eye-off" : "eye"}
                      size={16}
                      color={P.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Remember me + Forgot password */}
              <View style={s.optionsRow}>
                <TouchableOpacity
                  style={s.rememberRow}
                  onPress={() => setRememberMe((r) => !r)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      s.checkbox,
                      {
                        borderColor: rememberMe ? P.accent : P.inputBorder,
                        backgroundColor: rememberMe ? P.accent : P.inputBg,
                      },
                    ]}
                  >
                    {rememberMe && <Feather name="check" size={10} color="#FFFFFF" />}
                  </View>
                  <Text style={[s.rememberLabel, { color: P.textSecond }]}>
                    Se souvenir de moi
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push("/forgot-password")}
                  activeOpacity={0.7}
                >
                  <Text style={[s.forgotLink, { color: P.accent }]}>
                    {t("forgotPassword")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Error */}
              {!!error && (
                <View
                  style={[
                    s.errorBox,
                    { backgroundColor: P.errorBg, borderColor: P.errorBorder },
                  ]}
                >
                  <Feather name="alert-circle" size={14} color={P.error} />
                  <Text style={[s.errorText, { color: P.error }]}>{error}</Text>
                </View>
              )}

              {/* Primary CTA */}
              <TouchableOpacity
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.87}
                style={s.ctaOuter}
              >
                <LinearGradient
                  colors={
                    isDark
                      ? ["#3B82F6", "#2563EB"]
                      : ["#2563EB", "#1D4ED8"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.ctaGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Text style={s.ctaLabel}>{t("connect")}</Text>
                      <Feather name="arrow-right" size={17} color="#FFFFFF" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

            </View>
          </View>

          {/* ── TRUST SECTION ────────────────────────────────────── */}
          <View style={s.trustSection}>
            <View style={s.trustHeader}>
              <View style={[s.trustLine, { backgroundColor: P.divider }]} />
              <Text style={[s.trustHeaderLabel, { color: P.sectionLabel }]}>
                Plateforme certifiée entreprise
              </Text>
              <View style={[s.trustLine, { backgroundColor: P.divider }]} />
            </View>

            <View style={s.trustGrid}>
              {TRUST.map((item) => (
                <View
                  key={item.label}
                  style={[
                    s.trustItem,
                    { backgroundColor: P.featureBg, borderColor: P.border },
                  ]}
                >
                  <View style={[s.trustIconWrap, { backgroundColor: P.iconBg }]}>
                    <Feather name={item.icon} size={11} color={P.accent} />
                  </View>
                  <Text style={[s.trustLabel, { color: P.textMuted }]} numberOfLines={2}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── FOOTER ───────────────────────────────────────────── */}
          <Text style={[s.footer, { color: P.footerText }]}>
            © 2026 VERIDIAN · Tous droits réservés · v3.0
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Palettes ─────────────────────────────────────────────────────────────────

const DARK = {
  pageBg:       "#060C18",
  card:         "#0D1929",
  cardBorder:   "#1A2E4A",
  inputBg:      "#081221",
  inputBorder:  "#1A2E4A",
  featureBg:    "#0B1523",
  iconBg:       "rgba(59,130,246,0.14)",
  accent:       "#3B82F6",
  featureLabel: "#93C5FD",
  textPrimary:  "#E8F0FE",
  textSecond:   "#7A90B0",
  textMuted:    "#4A6080",
  label:        "#93C5FD",
  border:       "#192840",
  divider:      "rgba(255,255,255,0.06)",
  sectionLabel: "rgba(147,197,253,0.5)",
  footerText:   "rgba(74,96,128,0.6)",
  toggleBg:     "#0B1523",
  toggleIcon:   "#60A5FA",
  error:        "#F87171",
  errorBg:      "rgba(248,113,113,0.09)",
  errorBorder:  "rgba(248,113,113,0.22)",
};

const LIGHT = {
  pageBg:       "#E8EEFF",
  card:         "#FFFFFF",
  cardBorder:   "#D4DCF0",
  inputBg:      "#F2F5FF",
  inputBorder:  "#C8D3EE",
  featureBg:    "#FFFFFF",
  iconBg:       "rgba(37,99,235,0.09)",
  accent:       "#2563EB",
  featureLabel: "#1E2D4A",
  textPrimary:  "#0A1628",
  textSecond:   "#334466",
  textMuted:    "#647A99",
  label:        "#1E3A6A",
  border:       "#D4DCF0",
  divider:      "rgba(0,0,0,0.07)",
  sectionLabel: "rgba(30,58,106,0.45)",
  footerText:   "rgba(100,122,153,0.65)",
  toggleBg:     "#FFFFFF",
  toggleIcon:   "#0A1628",
  error:        "#DC2626",
  errorBg:      "#FEF2F2",
  errorBorder:  "#FECACA",
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({

  root: {
    flex: 1,
  },

  // Theme toggle
  toggleWrap: {
    position: "absolute",
    right: 20,
    zIndex: 100,
  },
  toggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },

  kav: { flex: 1 },

  scroll: {
    paddingHorizontal: 20,
    gap: 26,
  },

  // Brand
  brandArea: {
    alignItems: "center",
    gap: 10,
  },
  appName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: 5,
    marginTop: 4,
  },
  appTagline: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
    textAlign: "center",
    lineHeight: 16,
    maxWidth: 280,
  },

  // Section header
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    textAlign: "center",
  },

  // Feature tiles grid
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tile: {
    width: "48%",
    flexShrink: 1,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tileLabel: {
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
    flex: 1,
  },

  // Card
  card: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 12,
  },
  cardAccent: {
    height: 3,
  },
  cardBody: {
    padding: 26,
    gap: 18,
  },
  cardHead: { gap: 5 },
  welcomeTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  welcomeSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },

  divider: {
    height: 1,
    marginHorizontal: -26,
  },

  // Form
  field: { gap: 7 },
  fieldLabel: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 11,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },

  // Options row
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -2,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  rememberLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  forgotLink: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  // Error
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: -4,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },

  // CTA
  ctaOuter: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 8,
    marginTop: 2,
  },
  ctaGradient: {
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },

  // Trust
  trustSection: { gap: 12 },
  trustHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trustLine: {
    flex: 1,
    height: 1,
  },
  trustHeaderLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  trustGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  trustItem: {
    width: "30.5%",
    flexShrink: 1,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trustIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  trustLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
    lineHeight: 13,
    flex: 1,
  },

  // Footer
  footer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});

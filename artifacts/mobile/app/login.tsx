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
import Svg, { Rect, Path, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";

import MizanLogo from "@/components/brand/MizanLogo";
import { MIZAN } from "@/constants/brand";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

function LoginBgDecor({ isDark }: { isDark: boolean }) {
  const lineStr = isDark ? "rgba(255,255,255,0.03)" : "rgba(37,99,235,0.04)";
  const bldgFill = isDark ? "rgba(59,130,246,0.05)" : "rgba(37,99,235,0.03)";
  
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <SvgGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B82F6" stopOpacity={isDark ? "0.15" : "0.08"} />
          <Stop offset="1" stopColor="#070D1A" stopOpacity="0.0" />
        </SvgGradient>
      </Defs>
      <Rect x="0" y="0" width="390" height="844" fill="url(#lg1)" />
      {/* Background buildings grid */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <Path key={i} d={`M${20 + i*60},844 L${20 + i*60},${600 + (i%3)*40} L${60 + i*60},${600 + (i%3)*40} L${60 + i*60},844 Z`} fill={bldgFill} />
      ))}
      {/* Geometric Hexagons */}
      {[[320, 100], [50, 200], [350, 300], [80, 450]].map(([x, y], i) => (
        <Path
          key={`hex${i}`}
          d={`M${x},${y - 30} L${x + 25},${y - 15} L${x + 25},${y + 15} L${x},${y + 30} L${x - 25},${y + 15} L${x - 25},${y - 15} Z`}
          fill="none"
          stroke={lineStr}
          strokeWidth="1.5"
        />
      ))}
    </Svg>
  );
}

const FEATURES = [
  { icon: "home", label: "Propriétés" },
  { icon: "users", label: "Assemblées" },
  { icon: "file-text", label: "Documents" },
  { icon: "pen-tool", label: "Signatures" },
  { icon: "dollar-sign", label: "Finance" },
  { icon: "tool", label: "Maintenance" },
  { icon: "alert-triangle", label: "Incidents" },
  { icon: "bell", label: "Alertes" },
];

const TRUST = [
  { icon: "lock", label: "Chiffrement AES-256" },
  { icon: "shield", label: "Confidentialité CNDP" },
  { icon: "award", label: "Certifié ISO 27001" },
  { icon: "activity", label: "Audit continu" },
  { icon: "eye", label: "Traçabilité totale" },
  { icon: "file-text", label: "Signature légale" },
];

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { t } = useLanguage();
  const { isDark, toggle } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) { setError("E-mail requis"); return; }
    if (!password) { setError("Mot de passe requis"); return; }
    if (password.length < 6) { setError("Mot de passe trop court"); return; }
    
    setLoading(true);
    setError("");
    try {
      const ok = await login(email, password);
      if (!ok) {
        setError("Identifiants incorrects");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)/" as any);
      }
    } finally {
      setLoading(false);
    }
  };

  const bgColor = isDark ? "#070D1A" : "#F8FAFF";
  const fgColor = isDark ? "#FFFFFF" : "#0A1628";
  const mutedColor = isDark ? "#7A90B0" : "#64748B";
  const cardColor = isDark ? "#111D32" : "#FFFFFF";
  const cardBorder = isDark ? "#1E3050" : "#E2E8F0";
  const inputBg = isDark ? "#0D1929" : "#F1F5F9";

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      <LoginBgDecor isDark={isDark} />

      <View style={[styles.headerControls, { top: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.replace("/welcome")} style={[styles.iconBtn, { backgroundColor: cardColor, borderColor: cardBorder }]}>
          <Feather name="arrow-left" size={20} color={fgColor} />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggle} style={[styles.iconBtn, { backgroundColor: cardColor, borderColor: cardBorder }]}>
          <Feather name={isDark ? "sun" : "moon"} size={20} color={fgColor} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          
          <View style={styles.brandArea}>
            <MizanLogo variant="full" colorScheme={isDark ? "dark" : "light"} size={72} showTagline={false} />
            <Text style={[styles.appTagline, { color: mutedColor }]}>{MIZAN.taglineShort}</Text>
          </View>

          <View style={styles.featuresGrid}>
            {FEATURES.map(f => (
              <View key={f.label} style={[styles.featureTile, { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(37,99,235,0.03)", borderColor: cardBorder }]}>
                <Feather name={f.icon as any} size={16} color="#3B82F6" />
                <Text style={[styles.featureLabel, { color: fgColor }]}>{f.label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: cardColor, borderColor: cardBorder }]}>
            <View style={styles.cardAccent} />
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <Text style={[styles.welcomeTitle, { color: fgColor }]}>Bon retour</Text>
                <Text style={[styles.welcomeSub, { color: mutedColor }]}>Espace de travail sécurisé</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: cardBorder }]} />

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: fgColor }]}>E-mail professionnel</Text>
                <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: emailFocused ? "#2563EB" : cardBorder }]}>
                  <Feather name="mail" size={18} color={emailFocused ? "#2563EB" : mutedColor} />
                  <TextInput
                    style={[styles.input, { color: fgColor }]}
                    value={email} onChangeText={(v) => { setEmail(v); setError(""); }}
                    keyboardType="email-address" autoCapitalize="none"
                    placeholder="syndic@residence.ma" placeholderTextColor={mutedColor}
                    onFocus={() => setEmailFocused(true)} onBlur={() => setEmailFocused(false)}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: fgColor }]}>Mot de passe</Text>
                <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: passFocused ? "#2563EB" : cardBorder }]}>
                  <Feather name="lock" size={18} color={passFocused ? "#2563EB" : mutedColor} />
                  <TextInput
                    style={[styles.input, { color: fgColor }]}
                    value={password} onChangeText={(v) => { setPassword(v); setError(""); }}
                    secureTextEntry={!showPassword} placeholder="••••••••" placeholderTextColor={mutedColor}
                    onFocus={() => setPassFocused(true)} onBlur={() => setPassFocused(false)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={mutedColor} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.optionsRow}>
                <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe(!rememberMe)}>
                  <View style={[styles.checkbox, { borderColor: rememberMe ? "#2563EB" : cardBorder, backgroundColor: rememberMe ? "#2563EB" : "transparent" }]}>
                    {rememberMe && <Feather name="check" size={12} color="#FFF" />}
                  </View>
                  <Text style={[styles.rememberLabel, { color: mutedColor }]}>Se souvenir de moi</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.forgotButton} onPress={() => router.push("/forgot-password")}>
                  <Text style={styles.forgotLink}>Mot de passe oublié</Text>
                </TouchableOpacity>
              </View>

              {!!error && (
                <View style={[styles.errorBox, { backgroundColor: isDark ? "rgba(248,113,113,0.1)" : "#FEF2F2", borderColor: isDark ? "rgba(248,113,113,0.3)" : "#FECACA" }]}>
                  <Feather name="alert-circle" size={16} color="#DC2626" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity onPress={handleLogin} disabled={loading} style={styles.ctaOuter}>
                <LinearGradient colors={["#3B82F6", "#1D4ED8"]} style={styles.ctaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {loading ? <ActivityIndicator color="#FFF" /> : (
                    <>
                      <Text style={styles.ctaLabel}>Se connecter</Text>
                      <Feather name="arrow-right" size={18} color="#FFF" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.trustGrid}>
            {TRUST.map(item => (
              <View key={item.label} style={styles.trustItem}>
                <Feather name={item.icon as any} size={14} color="#3B82F6" />
                <Text style={[styles.trustLabel, { color: mutedColor }]}>{item.label}</Text>
              </View>
            ))}
          </View>
          
           <Text style={[styles.footer, { color: mutedColor }]}>{MIZAN.name} • Enterprise platform</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerControls: { position: "absolute", left: 24, right: 24, flexDirection: "row", justifyContent: "space-between", zIndex: 10 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  kav: { flex: 1 },
  scroll: { paddingHorizontal: 24, gap: 32 },
  
  brandArea: { alignItems: "center", gap: 12 },
  appTagline: { fontSize: 13, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" },

  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  featureTile: { width: "23.5%", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", gap: 8 },
  featureLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  card: { borderRadius: 24, borderWidth: 1, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12 },
  cardAccent: { height: 4, backgroundColor: "#2563EB" },
  cardBody: { padding: 24, gap: 20 },
  cardHead: { gap: 6 },
  welcomeTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  welcomeSub: { fontSize: 15, fontFamily: "Inter_400Regular" },
  divider: { height: 1, marginHorizontal: -24 },

  field: { gap: 8 },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, paddingVertical: Platform.OS === "ios" ? 16 : 12, gap: 12 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },

  optionsRow: { flexDirection: "row", alignItems: "center" },
  rememberRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  rememberLabel: { fontSize: 12, fontFamily: "Inter_500Medium", flexShrink: 1 },
  forgotButton: { marginLeft: 12, flexShrink: 0, alignItems: "flex-end" },
  forgotLink: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#2563EB", textAlign: "right" },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  errorText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: "#DC2626" },

  ctaOuter: { borderRadius: 16, overflow: "hidden", shadowColor: "#2563EB", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8, marginTop: 4 },
  ctaGradient: { paddingVertical: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  ctaLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF" },

  trustGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 16, columnGap: 8, justifyContent: "space-between" },
  trustItem: { width: "48%", flexDirection: "row", alignItems: "center", gap: 8 },
  trustLabel: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },

  footer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 16 },
});
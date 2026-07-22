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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import VeridianLogo from "@/components/brand/VeridianLogo";
import { useColorScheme } from "react-native";

function useRoles(t: (key: string) => string): {
  role: UserRole;
  label: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  email: string;
}[] {
  return [
    {
      role: "super_admin",
      label: t("superAdmin"),
      subtitle: t("superAdminDesc"),
      icon: "shield",
      email: "admin@veridian.app",
    },
    {
      role: "syndicate_admin",
      label: t("syndicateAdmin"),
      subtitle: t("syndicateAdminDesc"),
      icon: "briefcase",
      email: "syndic@veridian.app",
    },
    {
      role: "president",
      label: t("rolePresident"),
      subtitle: t("presidentDesc"),
      icon: "award",
      email: "president@andalous.ma",
    },
    {
      role: "treasurer",
      label: t("roleTresorier"),
      subtitle: t("treasurerDesc"),
      icon: "bar-chart-2",
      email: "tresorier@andalous.ma",
    },
    {
      role: "secretary",
      label: t("roleSecrétaire"),
      subtitle: t("secretaryDesc"),
      icon: "file-text",
      email: "secretaire@andalous.ma",
    },
    {
      role: "member",
      label: t("member"),
      subtitle: t("memberDesc"),
      icon: "user",
      email: "omar.benali@gmail.com",
    },
  ];
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { t } = useLanguage();
  const ROLES = useRoles(t);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [selectedRole, setSelectedRole] = useState<UserRole>("syndicate_admin");
  const [email, setEmail] = useState(__DEV__ ? "syndic@andalous.ma" : "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSelectRole = (r: typeof ROLES[number]) => {
    setSelectedRole(r.role);
    setEmail(r.email);
    setError("");
    Haptics.selectionAsync();
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      setError(t("emailRequired"));
      return;
    }
    if (!password) {
      setError(t("passwordRequired"));
      return;
    }
    if (password.length < 6) {
      setError(t("passwordTooShort"));
      return;
    }
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
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <VeridianLogo
              variant="full"
              colorScheme={isDark ? "dark" : "light"}
              size={90}
              showTagline
            />
          </View>

          {/* Role selector */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
              {t("selectRole")}
            </Text>
            <View style={styles.roleRow}>
              {ROLES.map((r) => {
                const active = selectedRole === r.role;
                return (
                  <TouchableOpacity
                    key={r.role}
                    style={[
                      styles.roleCard,
                      {
                        backgroundColor: active ? colors.primary : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleSelectRole(r)}
                    activeOpacity={0.75}
                  >
                    <Feather
                      name={r.icon}
                      size={20}
                      color={active ? "#fff" : colors.primary}
                    />
                    <Text
                      style={[
                        styles.roleLabel,
                        { color: active ? "#fff" : colors.foreground },
                      ]}
                    >
                      {r.label}
                    </Text>
                    <Text
                      style={[
                        styles.roleSub,
                        { color: active ? "rgba(255,255,255,0.75)" : colors.mutedForeground },
                      ]}
                    >
                      {r.subtitle}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Form */}
          <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.foreground }]}>{t("login")}</Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>{t("email")}</Text>
              <View
                style={[
                  styles.inputWrap,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <Feather name="mail" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={colors.mutedForeground}
                  placeholder={t("emailPlaceholder")}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>{t("password")}</Text>
              <View
                style={[
                  styles.inputWrap,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <Feather name="lock" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholderTextColor={colors.mutedForeground}
                  placeholder={t("passwordPlaceholder")}
                />
                <TouchableOpacity onPress={() => setShowPassword((p) => !p)}>
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.destructive + "15" }]}>
                <Feather name="alert-circle" size={14} color={colors.destructive} />
                <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.loginBtn,
                { backgroundColor: loading ? colors.primary + "80" : colors.primary },
              ]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>{t("connect")}</Text>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => router.push("/forgot-password")}
            >
              <Feather name="unlock" size={12} color={colors.mutedForeground} />
              <Text style={[styles.forgotText, { color: colors.mutedForeground }]}>
                {t("forgotPassword")}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.demoNote, { color: colors.mutedForeground }]}>
              {t("demoMode")}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    paddingHorizontal: 24,
    gap: 28,
  },
  logoSection: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  section: { gap: 12 },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  roleRow: {
    flexDirection: "row",
    gap: 10,
  },
  roleCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    padding: 12,
    gap: 5,
  },
  roleLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  roleSub: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  form: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 18,
  },
  formTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  inputGroup: { gap: 6 },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  forgotLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 2,
  },
  forgotText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  demoNote: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
  },
});

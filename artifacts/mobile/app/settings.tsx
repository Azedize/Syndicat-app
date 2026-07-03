import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { LANG_OPTIONS, useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();
  const { isDark, toggle: toggleTheme, mode, setMode } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [notifications, setNotifications] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [biometric, setBiometric] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [autoLock, setAutoLock] = useState(true);

  const toggle = (setter: (v: boolean) => void, val: boolean) => {
    setter(!val);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLogout = () => {
    Alert.alert(
      "Déconnexion",
      "Êtes-vous sûr de vouloir vous déconnecter ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Déconnecter",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/login");
          },
        },
      ]
    );
  };

  const initials = user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "";
  const roleLabel = user?.role === "super_admin" ? "Super Administrateur" : user?.role === "syndicate_admin" ? "Admin Syndicat" : "Membre";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Paramètres</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/profile" as any)}
          activeOpacity={0.85}
        >
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitials}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileRole}>{roleLabel}</Text>
            {user?.syndicate ? <Text style={styles.profileSyndicate}>{user.syndicate}</Text> : null}
          </View>
          <View style={styles.profileChevron}>
            <Feather name="edit-2" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.profileChevronText}>Modifier</Text>
          </View>
        </TouchableOpacity>

        {/* Appearance */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>APPARENCE</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Dark mode toggle */}
            <View style={styles.navRow}>
              <View style={[styles.rowIcon, { backgroundColor: isDark ? "#f59e0b18" : colors.primary + "18" }]}>
                <Feather name={isDark ? "moon" : "sun"} size={16} color={isDark ? "#f59e0b" : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.navLabel, { color: colors.foreground }]}>Mode sombre</Text>
                <Text style={[styles.navSub, { color: colors.mutedForeground }]}>
                  {mode === "system" ? "Automatique (système)" : isDark ? "Activé" : "Désactivé"}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={() => { toggleTheme(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                trackColor={{ false: colors.muted, true: colors.primary + "80" }}
                thumbColor={isDark ? colors.primary : colors.mutedForeground}
              />
            </View>
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            {/* System theme option */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => { setMode("system"); Haptics.selectionAsync(); }}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="monitor" size={16} color={colors.primary} />
              </View>
              <Text style={[styles.navLabel, { color: colors.foreground, flex: 1 }]}>Suivre le thème du système</Text>
              {mode === "system" ? <Feather name="check" size={18} color={colors.primary} /> : null}
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>NOTIFICATIONS</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingRow icon="bell" label="Notifications push" sub="Alertes et actualités" value={notifications} onToggle={() => toggle(setNotifications, notifications)} colors={colors} />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <SettingRow icon="mail" label="Notifications par email" sub="Récapitulatifs hebdomadaires" value={emailNotifs} onToggle={() => toggle(setEmailNotifs, emailNotifs)} colors={colors} />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <SettingRow icon="message-square" label="Notifications SMS" sub="Alertes urgentes seulement" value={smsNotifs} onToggle={() => toggle(setSmsNotifs, smsNotifs)} colors={colors} />
          </View>
        </View>

        {/* Language */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>{t("language").toUpperCase()}</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {LANG_OPTIONS.map((option, i) => (
              <View key={option.code}>
                {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                <TouchableOpacity
                  style={styles.langRow}
                  onPress={() => {
                    setLang(option.code);
                    Haptics.selectionAsync();
                  }}
                >
                  <View style={[styles.rowIcon, { backgroundColor: colors.primary + "18" }]}>
                    <Text style={{ fontSize: 16 }}>{option.flag}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.navLabel, { color: colors.foreground }]}>{option.nativeLabel}</Text>
                    {option.rtl && (
                      <Text style={[styles.navSub, { color: colors.mutedForeground }]}>RTL</Text>
                    )}
                  </View>
                  {lang === option.code ? <Feather name="check" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Security */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>SÉCURITÉ</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingRow icon="cpu" label="Authentification biométrique" sub="Face ID / Touch ID" value={biometric} onToggle={() => toggle(setBiometric, biometric)} colors={colors} />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <SettingRow icon="shield" label="Double authentification" sub="SMS / Application" value={twoFactor} onToggle={() => toggle(setTwoFactor, twoFactor)} colors={colors} />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <SettingRow icon="lock" label="Verrouillage auto" sub="Après 5 min d'inactivité" value={autoLock} onToggle={() => toggle(setAutoLock, autoLock)} colors={colors} />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.navRow} onPress={() => router.push("/profile" as any)}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="key" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.navLabel, { color: colors.foreground }]}>Changer le mot de passe</Text>
                <Text style={[styles.navSub, { color: colors.mutedForeground }]}>Via la page profil</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>À PROPOS</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { icon: "info" as const, label: "Version de l'application", value: "2.0.0" },
              { icon: "zap" as const, label: "Mode", value: "Démo (LocalStorage)" },
              { icon: "server" as const, label: "Statut serveur", value: "✓ Opérationnel" },
              { icon: "shield" as const, label: "Dernière mise à jour", value: "21 Mai 2026" },
            ].map((item, i) => (
              <View key={item.label}>
                {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                <View style={styles.navRow}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.primary + "18" }]}>
                    <Feather name={item.icon} size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.navLabel, { color: colors.foreground, flex: 1 }]}>{item.label}</Text>
                  <Text style={[styles.navValue, { color: colors.mutedForeground }]}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.destructive + "50" }]} onPress={handleLogout} activeOpacity={0.7}>
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SettingRow({ icon, label, sub, value, onToggle, colors }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sub?: string;
  value: boolean;
  onToggle: () => void;
  colors: any;
}) {
  return (
    <View style={styles.navRow}>
      <View style={[styles.rowIcon, { backgroundColor: colors.primary + "18" }]}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.navLabel, { color: colors.foreground }]}>{label}</Text>
        {sub ? <Text style={[styles.navSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.muted, true: colors.primary + "80" }}
        thumbColor={value ? colors.primary : colors.mutedForeground}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  profileCard: {
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitials: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  profileName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  profileRole: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  profileSyndicate: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  profileChevron: { alignItems: "center", gap: 4 },
  profileChevronText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.8)" },
  group: { gap: 8 },
  groupTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginLeft: 4 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  navRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  navLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  navSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  navValue: { fontSize: 12, fontFamily: "Inter_400Regular" },
  langRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  sep: { height: 1, marginHorizontal: 14 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  logoutText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

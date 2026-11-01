import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";

type SubStatus = {
  effectiveStatus: string;
  isReadOnly: boolean;
  daysRemaining: number | null;
};

const POLL_MS = 5 * 60 * 1000;

export default function SubscriptionBanner() {
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const colors = useColors();
  const [status, setStatus] = useState<SubStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const shouldCheck = user?.role === "syndicate_admin";

  useEffect(() => {
    if (!shouldCheck || !token) return;
    const check = async () => {
      try {
        const res = await apiRequest("/subscriptions/status", "GET", undefined, token);
        if (res?.data) {
          setStatus(res.data);
          Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        }
      } catch { /* silent */ }
    };
    check();
    const iv = setInterval(check, POLL_MS);
    return () => clearInterval(iv);
  }, [token, shouldCheck]);

  if (!status || !shouldCheck || dismissed) return null;

  const { effectiveStatus, isReadOnly, daysRemaining } = status;

  const visible =
    isReadOnly ||
    effectiveStatus === "grace" ||
    (daysRemaining !== null && daysRemaining <= 7);

  if (!visible) return null;

  const isGrace = effectiveStatus === "grace";

  const cfg = isReadOnly
    ? { bg: "#C8323C15", border: "#C8323C40", icon: "alert-circle" as const, color: "#C8323C",
        text: t("sbReadOnly") }
    : isGrace
    ? { bg: "#C9851115", border: "#C9851140", icon: "alert-triangle" as const, color: "#C98511",
        text: t("sbGrace").replace("{n}", String(daysRemaining ?? 0)) }
    : { bg: "#5A4AD615", border: "#5A4AD640", icon: "clock" as const, color: "#5A4AD6",
        text: daysRemaining === 0
          ? t("sbTrialEndsToday")
          : t("sbTrialDays").replace("{n}", String(daysRemaining)) };

  return (
    <Animated.View style={[styles.banner, { backgroundColor: cfg.bg, borderColor: cfg.border, opacity: fadeAnim }]}>
      <Feather name={cfg.icon} size={13} color={cfg.color} />
      <Text style={[styles.text, { color: cfg.color }]} numberOfLines={1}>{cfg.text}</Text>
      <TouchableOpacity
        style={[styles.upgradeBtn, { backgroundColor: cfg.color }]}
        onPress={() => router.push("/abonnements" as any)}
        activeOpacity={0.8}
      >
        <Text style={styles.upgradeBtnText}>{t("sbRenew")}</Text>
      </TouchableOpacity>
      {!isReadOnly && (
        <TouchableOpacity onPress={() => setDismissed(true)} style={styles.dismiss}>
          <Feather name="x" size={13} color={cfg.color} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, gap: 8,
  },
  text: { flex: 1, fontSize: 11, fontFamily: "Inter_500Medium" },
  upgradeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  upgradeBtnText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  dismiss: { padding: 2 },
});

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Toast, useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";

const TYPE_CONFIG = {
  success: { icon: "check-circle" as const, bg: "#10b981", text: "#fff" },
  error: { icon: "alert-circle" as const, bg: "#ef4444", text: "#fff" },
  warning: { icon: "alert-triangle" as const, bg: "#f59e0b", text: "#fff" },
  info: { icon: "bell" as const, bg: "#7c3aed", text: "#fff" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const cfg = TYPE_CONFIG[toast.type];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -120, duration: 280, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 4200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.toast, { backgroundColor: cfg.bg, transform: [{ translateY }], opacity }]}>
      <View style={styles.toastIcon}>
        <Feather name={cfg.icon} size={18} color={cfg.text} />
      </View>
      <Text style={[styles.toastMsg, { color: cfg.text }]} numberOfLines={2}>
        {toast.message}
      </Text>
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDismiss(); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="x" size={16} color={cfg.text} style={{ opacity: 0.8 }} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();
  const insets = useSafeAreaInsets();
  const topOffset = Platform.OS === "web" ? 16 : insets.top + 8;

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { top: topOffset }]}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  toastIcon: { flexShrink: 0 },
  toastMsg: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
});

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Toast, useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  success: {
    icon:        "check-circle" as const,
    accent:      "#10b981",
    iconBg:      "#d1fae5",
    iconColor:   "#065f46",
    defaultTitle:"Succès",
  },
  error: {
    icon:        "x-circle" as const,
    accent:      "#ef4444",
    iconBg:      "#fee2e2",
    iconColor:   "#991b1b",
    defaultTitle:"Erreur",
  },
  warning: {
    icon:        "alert-triangle" as const,
    accent:      "#f59e0b",
    iconBg:      "#fef3c7",
    iconColor:   "#92400e",
    defaultTitle:"Attention",
  },
  info: {
    icon:        "info" as const,
    accent:      "#6366f1",
    iconBg:      "#ede9fe",
    iconColor:   "#4338ca",
    defaultTitle:"Information",
  },
};

const DURATION_MS = 4500;

// ─── Single toast item ────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const colors = useColors();
  const cfg = TYPE_CONFIG[toast.type];

  // Entrance animation
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(0.94)).current;

  // Progress bar (1 → 0 over DURATION_MS)
  const progress   = useRef(new Animated.Value(1)).current;

  const dismissed = useRef(false);

  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    Animated.parallel([
      Animated.timing(translateY, { toValue: -80, duration: 260, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 0,   duration: 260, useNativeDriver: true }),
      Animated.timing(scale,      { toValue: 0.94, duration: 260, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  useEffect(() => {
    // Slide + fade in
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 90, friction: 11 }),
      Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scale,      { toValue: 1, useNativeDriver: true, tension: 90, friction: 11 }),
    ]).start();

    // Progress bar draining
    Animated.timing(progress, {
      toValue:        0,
      duration:       DURATION_MS,
      useNativeDriver: false,   // width animation needs layout driver
    }).start();

    const timer = setTimeout(dismiss, DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  const title = toast.title ?? cfg.defaultTitle;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor:     colors.border,
          transform: [{ translateY }, { scale }],
          opacity,
          // Subtle shadow tinted by accent
          shadowColor: cfg.accent,
        },
      ]}
    >
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: cfg.accent }]} />

      {/* Icon badge */}
      <View style={[styles.iconBadge, { backgroundColor: cfg.iconBg }]}>
        <Feather name={cfg.icon} size={18} color={cfg.iconColor} />
      </View>

      {/* Text */}
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.message, { color: colors.mutedForeground }]} numberOfLines={2}>
          {toast.message}
        </Text>
      </View>

      {/* Dismiss button */}
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          dismiss();
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.closeBtn}
      >
        <Feather name="x" size={15} color={colors.mutedForeground} />
      </TouchableOpacity>

      {/* Progress bar */}
      <Animated.View
        style={[
          styles.progressTrack,
          { backgroundColor: cfg.accent + "22" },
        ]}
      >
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: cfg.accent,
              width: progress.interpolate({
                inputRange:  [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();
  const insets   = useSafeAreaInsets();
  const topOffset = Platform.OS === "web" ? 20 : insets.top + 12;

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { top: topOffset }]} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position:  "absolute",
    left:      14,
    right:     14,
    zIndex:    9999,
    gap:       10,
  },
  card: {
    flexDirection:    "row",
    alignItems:       "center",
    borderRadius:     18,
    borderWidth:      1,
    overflow:         "hidden",
    paddingVertical:  14,
    paddingHorizontal: 14,
    gap:              12,
    // Shadow
    shadowOffset:  { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius:  18,
    elevation:     10,
  },
  accentBar: {
    position:     "absolute",
    left:         0,
    top:          0,
    bottom:       0,
    width:        4,
    borderTopLeftRadius:    18,
    borderBottomLeftRadius: 18,
  },
  iconBadge: {
    width:         38,
    height:        38,
    borderRadius:  12,
    alignItems:    "center",
    justifyContent:"center",
    marginLeft:    4,
    flexShrink:    0,
  },
  textBlock: {
    flex: 1,
    gap:  3,
  },
  title: {
    fontSize:    14,
    fontFamily:  "Inter_700Bold",
    lineHeight:  19,
  },
  message: {
    fontSize:   12.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  closeBtn: {
    padding:   4,
    flexShrink: 0,
  },
  progressTrack: {
    position:      "absolute",
    bottom:        0,
    left:          0,
    right:         0,
    height:        3,
    borderBottomLeftRadius:  18,
    borderBottomRightRadius: 18,
    overflow:      "hidden",
  },
  progressFill: {
    height: "100%",
    borderBottomLeftRadius:  18,
    borderBottomRightRadius: 18,
  },
});

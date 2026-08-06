import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface LoadingStateProps {
  title: string;
  description?: string;
  accentColor?: string;
}

interface ErrorStateProps {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
  accentColor?: string;
}

function StateShell({ children }: { children: React.ReactNode }) {
  return <View style={styles.shell}>{children}</View>;
}

export function LoadingState({ title, description, accentColor }: LoadingStateProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.45, duration: 850, useNativeDriver: false }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <StateShell>
      <View style={[styles.iconWrap, { backgroundColor: accent + "15" }]}>
        <ActivityIndicator color={accent} size="small" />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text> : null}
      <View style={styles.skeletonGroup} accessibilityLabel={title}>
        {[0.88, 0.66, 0.76].map((width, index) => (
          <Animated.View
            key={index}
            style={[
              styles.skeletonLine,
              { width: `${width * 100}%`, backgroundColor: colors.muted, opacity: pulse },
            ]}
          />
        ))}
      </View>
    </StateShell>
  );
}

export function ErrorState({ title, description, retryLabel, onRetry, accentColor }: ErrorStateProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.destructive ?? "#ef4444";

  return (
    <StateShell>
      <View style={[styles.iconWrap, { backgroundColor: accent + "15" }]}>
        <Feather name="wifi-off" size={28} color={accent} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>
      <TouchableOpacity
        style={[styles.action, { backgroundColor: accent }]}
        onPress={onRetry}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
      >
        <Feather name="refresh-cw" size={15} color="#fff" />
        <Text style={styles.actionText}>{retryLabel}</Text>
      </TouchableOpacity>
    </StateShell>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 36,
    gap: 10,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  description: {
    maxWidth: 320,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  skeletonGroup: {
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
    gap: 9,
    marginTop: 8,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  actionText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
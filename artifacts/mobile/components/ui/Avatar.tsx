import { Image } from "expo-image";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FONT } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
}

/** Initials from a name (handles Latin and Arabic names, ignores particles). */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p && !/^(de|du|el|al|ben|bin|la|le)$/i.test(p));
  const chars = (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1)).map((p) => Array.from(p)[0] ?? "");
  return chars.join("").toUpperCase() || "?";
}

// Stable, calm hues — the same person always gets the same color.
const HUES = ["#1F5EFF", "#11998A", "#7C5CD6", "#C8932F", "#2F6BE8", "#D25C7A", "#3E8E5E"];

/** Profile picture with an initials fallback (also when the image fails). */
export default function Avatar({ name, uri, size = 40 }: AvatarProps) {
  const colors = useColors();
  const [failed, setFailed] = useState(false);
  const hue = HUES[Array.from(name).reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length];
  const radius = size / 2;
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.surfaceMuted }}
        onError={() => setFailed(true)}
        accessibilityLabel={name}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: radius, backgroundColor: hue + "1F" }]} accessible accessibilityLabel={name}>
      <Text style={{ color: hue, fontFamily: FONT.bold, fontSize: Math.round(size * 0.38) }} allowFontScaling={false}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
});

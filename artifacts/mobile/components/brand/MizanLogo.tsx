/**
 * MizanLogo — Official MIZAN brand component.
 *
 * Renders the MIZAN balance mark combined with the wordmark and optional tagline.
 * The mark is intentionally vector-based so it stays clear from compact navigation
 * contexts through documents and onboarding.
 */

import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { MIZAN } from "@/constants/brand";

interface ShieldProps {
  height: number;
  isDark: boolean;
}

function Shield({ height, isDark }: ShieldProps) {
  const markFill = isDark ? MIZAN.colors.navyMid : MIZAN.colors.white;
  const markStroke = isDark ? MIZAN.colors.white : MIZAN.colors.navyDeep;
  const blueId = isDark ? "mizanBlueDark" : "mizanBlueLight";

  return (
    <Svg width={height} height={height} viewBox="0 0 88 88">
      <Defs>
        <LinearGradient id={blueId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={MIZAN.colors.blueLight} />
          <Stop offset="1" stopColor={MIZAN.colors.teal} />
        </LinearGradient>
      </Defs>
      <Rect
        x="3"
        y="3"
        width="82"
        height="82"
        rx="24"
        fill={markFill}
        stroke={isDark ? "rgba(255,255,255,0.18)" : MIZAN.colors.bluePale}
        strokeWidth="1.5"
      />
      <Path
        d="M18 59 V29 L32 43 L44 25 L56 43 L70 29 V59"
        fill="none"
        stroke={markStroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M20 68 H68" stroke={MIZAN.colors.gold} strokeWidth="4" strokeLinecap="round" />
      <Circle cx="20" cy="68" r="3.5" fill={MIZAN.colors.gold} />
      <Circle cx="44" cy="68" r="3.5" fill={`url(#${blueId})`} />
      <Circle cx="68" cy="68" r="3.5" fill={MIZAN.colors.gold} />
      <Path d="M44 25 V18" stroke={`url(#${blueId})`} strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

export type LogoVariant = "full" | "horizontal" | "icon" | "compact";
export type LogoColorScheme = "light" | "dark";

interface MizanLogoProps {
  variant?: LogoVariant;
  colorScheme?: LogoColorScheme;
  size?: number;
  showTagline?: boolean;
  style?: ViewStyle;
}

export default function MizanLogo({
  variant = "full",
  colorScheme = "light",
  size = 80,
  showTagline = true,
  style,
}: MizanLogoProps) {
  const isDark = colorScheme === "dark";
  const textColor = isDark ? MIZAN.colors.white : MIZAN.colors.navyDeep;
  const taglineColor = isDark ? MIZAN.colors.bluePale : MIZAN.colors.blue;
  const wordmarkSize = Math.round(size * 0.31);
  const taglineSize = Math.max(8, Math.round(size * 0.11));
  const wordmarkTracking = Math.round(size * 0.05 * 10) / 10;

  if (variant === "icon" || variant === "compact") {
    const shieldHeight = variant === "compact" ? Math.round(size * 0.75) : size;
    return (
      <View style={style}>
        <Shield height={shieldHeight} isDark={isDark} />
      </View>
    );
  }

  if (variant === "horizontal") {
    const shieldHeight = Math.round(size * 0.75);
    return (
      <View style={[styles.row, style]}>
        <Shield height={shieldHeight} isDark={isDark} />
        <View style={styles.wordmarkCol}>
          <Text
            style={[styles.wordmark, { color: textColor, fontSize: wordmarkSize, letterSpacing: wordmarkTracking }]}
            allowFontScaling={false}
          >
            MIZAN
          </Text>
          {showTagline && (
            <Text
              style={[styles.tagline, { color: taglineColor, fontSize: taglineSize, letterSpacing: wordmarkTracking * 0.5 }]}
              allowFontScaling={false}
              numberOfLines={1}
            >
              {MIZAN.taglineShort.toUpperCase()}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.col, style]}>
      <Shield height={size} isDark={isDark} />
      <Text
        style={[
          styles.wordmark,
          { color: textColor, fontSize: wordmarkSize, letterSpacing: wordmarkTracking, marginTop: Math.round(size * 0.09) },
        ]}
        allowFontScaling={false}
      >
        MIZAN
      </Text>
      {showTagline && (
        <Text
          style={[
            styles.tagline,
            { color: taglineColor, fontSize: taglineSize, letterSpacing: wordmarkTracking * 0.45, marginTop: 3 },
          ]}
          allowFontScaling={false}
        >
          {MIZAN.tagline.toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wordmarkCol: { justifyContent: "center", gap: 2 },
  wordmark: { fontFamily: "Inter_700Bold" },
  tagline: { fontFamily: "Inter_500Medium" },
});
/**
 * MizanLogo — Official MIZAN brand logo component
 *
 * Renders the MIZAN balance mark (SVG vector) combined with the wordmark
 * and optional tagline.
 *
 * Variants:
 *   "full"       — Shield stacked above wordmark + tagline (login, splash, onboarding)
 *   "horizontal" — Shield left, wordmark right (sidebar, header, docs)
 *   "icon"       — Shield only, no text (nav bar icon, avatar, app icon slot)
 *   "compact"    — Small shield only (tight spaces, PDF corner mark)
 *
 * Color schemes:
 *   "light"  — Dark navy shield + navy/blue wordmark on white/light bg
 *   "dark"   — White shield + white/blue wordmark on dark/navy bg
 *
 * Size:
 *   Controls the shield height in pixels; all other dimensions scale proportionally.
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

// ─── Shield Icon ─────────────────────────────────────────────────────────────

interface ShieldProps {
  /** Total height of the shield in dp */
  height: number;
  isDark: boolean;
}

/**
 * The MIZAN mark — a geometric M balanced on a gold governance line.
 *
 * Coordinate space: viewBox "0 0 88 100".
 * Shield occupies x 4–84, y 3–98.
 */
function Shield({ height, isDark }: ShieldProps) {
  const width = height;
  const markFill = isDark ? MIZAN.colors.navyMid : MIZAN.colors.white;
  const markStroke = isDark ? MIZAN.colors.white : MIZAN.colors.navyDeep;
  const blueId = isDark ? "mizanBlueDark" : "mizanBlueLight";

  return (
    <Svg width={width} height={height} viewBox="0 0 88 88">
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
        stroke={isDark ? "rgba(255,255,255,0.18)" : "#DCE6F3"}
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

      <Path
        d="M20 68 H68"
        stroke={MIZAN.colors.gold}
        strokeWidth="4"
        strokeLinecap="round"
      />

      <Circle cx="20" cy="68" r="3.5" fill={MIZAN.colors.gold} />
      <Circle cx="44" cy="68" r="3.5" fill={`url(#${blueId})`} />
      <Circle cx="68" cy="68" r="3.5" fill={MIZAN.colors.gold} />
      <Path
        d="M44 25 V18"
        stroke={`url(#${blueId})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Public Props ─────────────────────────────────────────────────────────────

export type LogoVariant = "full" | "horizontal" | "icon" | "compact";
export type LogoColorScheme = "light" | "dark";

interface MizanLogoProps {
  variant?: LogoVariant;
  colorScheme?: LogoColorScheme;
  /**
   * Shield height in dp. Everything else scales from this.
   * Recommended values: 40 (sidebar), 72 (login), 90 (splash), 24 (compact).
   */
  size?: number;
  showTagline?: boolean;
  style?: ViewStyle;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MizanLogo({
  variant = "full",
  colorScheme = "light",
  size = 80,
  showTagline = true,
  style,
}: MizanLogoProps) {
  const isDark = colorScheme === "dark";

  const textColor = isDark ? MIZAN.colors.white : MIZAN.colors.navyDeep;
  const taglineColor = isDark
    ? MIZAN.colors.bluePale
    : MIZAN.colors.blue;

  // Wordmark font size — "MIZAN" should feel substantial relative to the mark
  const wordmarkSize = Math.round(size * 0.31);
  const taglineSize = Math.max(8, Math.round(size * 0.11));
  const wordmarkTracking = Math.round(size * 0.05 * 10) / 10;

  // ── Icon only ──────────────────────────────────────────────────────────────
  if (variant === "icon" || variant === "compact") {
    const shieldHeight = variant === "compact" ? Math.round(size * 0.75) : size;
    return (
      <View style={style}>
        <Shield height={shieldHeight} isDark={isDark} />
      </View>
    );
  }

  // ── Horizontal (shield left, wordmark right) ───────────────────────────────
  if (variant === "horizontal") {
    const shieldHeight = Math.round(size * 0.75);
    return (
      <View style={[s.row, style]}>
        <Shield height={shieldHeight} isDark={isDark} />
        <View style={s.wordmarkCol}>
          <Text
            style={[
              s.wordmark,
              { color: textColor, fontSize: wordmarkSize, letterSpacing: wordmarkTracking },
            ]}
            allowFontScaling={false}
          >
            MIZAN
          </Text>
          {showTagline && (
            <Text
              style={[
                s.tagline,
                { color: taglineColor, fontSize: taglineSize, letterSpacing: wordmarkTracking * 0.5 },
              ]}
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

  // ── Full (shield above, wordmark below) ────────────────────────────────────
  return (
    <View style={[s.col, style]}>
      <Shield height={size} isDark={isDark} />
      <Text
        style={[
          s.wordmark,
          {
            color: textColor,
            fontSize: wordmarkSize,
            letterSpacing: wordmarkTracking,
            marginTop: Math.round(size * 0.09),
          },
        ]}
        allowFontScaling={false}
      >
        MIZAN
      </Text>
      {showTagline && (
        <Text
          style={[
            s.tagline,
            {
              color: taglineColor,
              fontSize: taglineSize,
              letterSpacing: wordmarkTracking * 0.45,
              marginTop: 3,
            },
          ]}
          allowFontScaling={false}
        >
          {MIZAN.tagline.toUpperCase()}
        </Text>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  col: {
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wordmarkCol: {
    justifyContent: "center",
    gap: 2,
  },
  wordmark: {
    fontFamily: "Inter_700Bold",
  },
  tagline: {
    fontFamily: "Inter_500Medium",
  },
});

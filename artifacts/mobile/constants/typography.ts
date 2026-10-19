import type { TextStyle } from "react-native";

/**
 * MIZAN type presets — one hierarchy for every screen.
 *
 * Inter carries Latin text. Arabic glyphs are not in Inter: iOS and Android
 * fall back to the system Arabic face (SF Arabic / Noto Naskh Arabic), which
 * shapes and places diacritics correctly. Presets therefore avoid negative
 * letter-spacing on body sizes (it breaks Arabic joining) and keep generous
 * line heights for diacritics.
 *
 * Amounts use tabular figures so columns of numbers stay aligned.
 *
 * Usage: <Text style={[TYPE.title, { color: colors.foreground }]} />
 */
export const FONT = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const TYPE = {
  /** 32 — one display figure per screen (balance, hero amount) */
  display: { fontFamily: FONT.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  /** 24 — screen title */
  title: { fontFamily: FONT.bold, fontSize: 24, lineHeight: 32, letterSpacing: -0.3 },
  /** 20 — large section heading / sheet title */
  headline: { fontFamily: FONT.semibold, fontSize: 20, lineHeight: 28 },
  /** 16 — section heading, card title */
  subtitle: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 24 },
  /** 14 — body text */
  body: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 21 },
  /** 14 — emphasised body (list item title) */
  bodyStrong: { fontFamily: FONT.semibold, fontSize: 14, lineHeight: 21 },
  /** 13 — secondary description */
  secondary: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 19 },
  /** 13 — form label */
  label: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18 },
  /** 11 — metadata, timestamps */
  caption: { fontFamily: FONT.medium, fontSize: 11, lineHeight: 16 },
  /** 11 — eyebrow above a heading (uppercase in Latin scripts only) */
  overline: { fontFamily: FONT.semibold, fontSize: 11, lineHeight: 16, letterSpacing: 0.8 },
  /** 10 — badge counts */
  micro: { fontFamily: FONT.bold, fontSize: 10, lineHeight: 14 },
  /** Amount in a list or card */
  amount: { fontFamily: FONT.bold, fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
  /** Large amount (cards, summaries) */
  amountLarge: { fontFamily: FONT.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, fontVariant: ["tabular-nums"] },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof TYPE;

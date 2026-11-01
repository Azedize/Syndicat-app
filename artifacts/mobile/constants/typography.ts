import type { TextStyle } from "react-native";

/**
 * MIZAN type presets — one hierarchy for every screen.
 *
 * Two families (rationale in docs/design/DESIGN_SYSTEM.md):
 *   - Fraunces (serif, editorial) for display, titles and hero amounts: the
 *     product voice, a residence ledger rather than a SaaS dashboard.
 *   - Inter for everything read at length (body, labels, tables).
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
  /** Fraunces — display and titles only */
  display: "Fraunces_600SemiBold",
  displayMedium: "Fraunces_500Medium",
} as const;

export const TYPE = {
  /** 32 — one display figure per screen (balance, hero amount) */
  display: { fontFamily: FONT.displayMedium, fontSize: 34, lineHeight: 42, letterSpacing: -0.3, fontVariant: ["lining-nums"] },
  /** 24 — screen title */
  title: { fontFamily: FONT.display, fontSize: 25, lineHeight: 33 },
  /** 20 — large section heading / sheet title */
  headline: { fontFamily: FONT.display, fontSize: 20, lineHeight: 28 },
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
  amountLarge: { fontFamily: FONT.displayMedium, fontSize: 26, lineHeight: 32, fontVariant: ["lining-nums", "tabular-nums"] },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof TYPE;

// ── Script-aware display face ──────────────────────────────────────────────
// Fraunces has no Arabic glyphs: an Arabic title would fall back to a thin
// system face. In Arabic the display presets switch to Noto Kufi Arabic
// (geometric kufic, echoing the arch of the mark) with taller lines for
// Arabic ascenders. Called by LanguageProvider before its children render;
// switching to or from Arabic restarts the app (RTL), so static styles built
// at startup also pick the right face.
const LATIN_DISPLAY = { display: FONT.display, displayMedium: FONT.displayMedium };
const ARABIC_DISPLAY = { display: "NotoKufiArabic_600SemiBold", displayMedium: "NotoKufiArabic_500Medium" };
const LATIN_LINES = { display: TYPE.display.lineHeight, title: TYPE.title.lineHeight, headline: TYPE.headline.lineHeight };

export function applyScriptFonts(lang: string) {
  const ar = lang === "ar";
  const face = ar ? ARABIC_DISPLAY : LATIN_DISPLAY;
  const f = FONT as unknown as Record<string, string>;
  f.display = face.display;
  f.displayMedium = face.displayMedium;
  const t = TYPE as unknown as Record<"display" | "title" | "headline", { fontFamily?: string; lineHeight?: number }>;
  t.display.fontFamily = face.displayMedium;
  t.title.fontFamily = face.display;
  t.headline.fontFamily = face.display;
  const k = ar ? 1.22 : 1;
  t.display.lineHeight = Math.round(LATIN_LINES.display * k);
  t.title.lineHeight = Math.round(LATIN_LINES.title * k);
  t.headline.lineHeight = Math.round(LATIN_LINES.headline * k);
}

/** Display family for styles built outside TYPE (StyleSheet objects). */
export function displayFace(lang: string, weight: "semibold" | "medium" = "semibold") {
  const face = lang === "ar" ? ARABIC_DISPLAY : LATIN_DISPLAY;
  return weight === "medium" ? face.displayMedium : face.display;
}

/**
 * Design tokens — WCAG contrast of every text/background pair the UI kit uses
 * (artifacts/mobile/constants/colors.ts), in light and dark mode.
 *
 * Text pairs must reach 4.5:1 (WCAG 2.1 AA, normal text). Large-text-only
 * pairs (≥ 18.66 px bold / 24 px) are checked against 3:1 and listed apart.
 *
 * Run: pnpm --filter @workspace/scripts design-tokens:test
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

// Loaded at run time: the token file lives in the mobile package, outside this
// package's rootDir. Under tsx the default export may arrive wrapped.
type Palette = Record<string, string>;
type Tokens = { light: Palette; dark: Palette };
const tokensPath = path.resolve(import.meta.dirname, "../../artifacts/mobile/constants/colors.ts");
const mod = (await import(pathToFileURL(tokensPath).href)) as { default: Tokens | { default: Tokens } };
const colors: Tokens = "light" in mod.default ? mod.default : mod.default.default;

function luminance(hex: string) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// [foreground token, background token, minimum]
const PAIRS: Array<[string, string, number]> = [
  ["foreground", "background", 4.5],
  ["foreground", "card", 4.5],
  ["textSecondary", "background", 4.5],
  ["textSecondary", "card", 4.5],
  ["textMuted", "background", 4.5],
  ["textMuted", "card", 4.5],
  ["textMuted", "surfaceMuted", 4.5],
  ["primaryForeground", "primary", 4.5],
  ["secondaryForeground", "secondary", 4.5],
  ["accentForeground", "accent", 4.5],
  ["successText", "successSoft", 4.5],
  ["warningText", "warningSoft", 4.5],
  ["dangerText", "dangerSoft", 4.5],
  ["infoText", "infoSoft", 4.5],
  ["destructiveForeground", "destructive", 4.5],
  ["goldText", "goldSoft", 4.5],
  ["goldText", "card", 4.5],
  // Text links and primary-colored labels use "tint" (AA in both modes).
  ["tint", "background", 4.5],
  ["tint", "card", 4.5],
  ["tint", "primarySoft", 4.5],
  ["tabActive", "surface", 4.5],
  ["textMuted", "surface", 4.5],
  // Primary used as link text on the page: AA in light; large-text level in dark (documented).
  ["primary", "background", 3],
  ["primary", "card", 3],
];

let failed = 0;
const notes: string[] = [];
for (const mode of ["light", "dark"] as const) {
  const p = colors[mode];
  for (const [fg, bg, min] of PAIRS) {
    const r = ratio(p[fg], p[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    if (min < 4.5 && r < 4.5) notes.push(`${mode} ${fg}/${bg} ${r.toFixed(2)}:1 — large text / links only`);
    console.log(`${ok ? "PASS" : "FAIL"} ${mode.padEnd(5)} ${String(fg).padEnd(22)} on ${String(bg).padEnd(14)} ${r.toFixed(2)}:1 (≥ ${min})`);
  }
}
if (notes.length) console.log("\nBelow 4.5:1 (allowed for large text only):\n  " + notes.join("\n  "));
const total = PAIRS.length * 2;
console.log(`\n${total - failed}/${total} contrast checks passed`);
if (failed) process.exit(1);

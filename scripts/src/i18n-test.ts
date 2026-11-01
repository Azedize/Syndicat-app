/**
 * Translations and reading direction (2026-10-24) — static checks on the
 * mobile app, no server needed:
 *
 *   pnpm --filter @workspace/scripts run i18n:test
 *
 * - every key of the dictionary has French, Arabic, Spanish (and English);
 * - an Arabic value is written in Arabic (brand names, codes and formats
 *   excepted); a Spanish value is not left in French;
 * - every t("key") used in the code exists;
 * - placeholders ({n}, {name}…) are the same in every language;
 * - directional icons are mirrored in Arabic, others are not.
 * Prints the remaining problems; fails if there is any.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const MOBILE = path.resolve("../artifacts/mobile");
const require = createRequire(path.join(MOBILE, "package.json"));
const ts = require("typescript") as typeof import("typescript");

const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

type Entry = Partial<Record<"fr" | "en" | "ar" | "es", string>>;
function readDictionary(): Map<string, Entry> {
  const file = path.join(MOBILE, "i18n/translations.ts");
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const dict = new Map<string, Entry>();
  const visit = (n: import("typescript").Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isObjectLiteralExpression(n.initializer) && n.initializer.properties.length > 500) {
      for (const p of n.initializer.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        const key = p.name.getText(src).replace(/^["']|["']$/g, "");
        const entry: Entry = {};
        for (const q of p.initializer.properties) {
          if (ts.isPropertyAssignment(q) && (ts.isStringLiteral(q.initializer) || ts.isNoSubstitutionTemplateLiteral(q.initializer))) {
            const lang = q.name.getText(src) as keyof Entry;
            entry[lang] = q.initializer.text;
          }
        }
        dict.set(key, entry);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return dict;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

// Values that are legitimately identical in every language or not Arabic text.
const LATIN_OK = /^([•·*]+|[A-Z0-9 .:/+\-()%#&@·—–_]{1,12}|MIZAN|PDF|ICE|PayPal|Face ID \/ Touch ID|email@example\.com|[\w.+-]+@[\w.-]+|\+?\d[\d \-]*|v?\d+(\.\d+)*|https?:\/\/\S+)$/i;
const ARABIC = /[؀-ۿ]/;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

function main() {
  const dict = readDictionary();
  check("dictionary read", dict.size > 1000, `${dict.size} keys`);

  const missing: string[] = [];
  // Intentionally empty: English puts no word before « 5m ».
  const EMPTY_OK = new Set(["annTimeAgoPrefix.en"]);
  for (const [k, e] of dict) for (const l of ["fr", "ar", "es", "en"] as const) if (!e[l]?.trim() && !EMPTY_OK.has(`${k}.${l}`)) missing.push(`${k}.${l}`);
  check("every key has fr, ar, es and en", missing.length === 0, missing.slice(0, 8).join(", ") || "none");

  const notArabic = [...dict].filter(([, e]) => e.ar && !ARABIC.test(e.ar) && !LATIN_OK.test(e.ar.trim())).map(([k, e]) => `${k}=«${e.ar}»`);
  check("Arabic values are in Arabic", notArabic.length === 0, notArabic.slice(0, 8).join(", ") || "none");

  const frenchInSpanish = [...dict]
    .filter(([, e]) => e.es && e.fr && e.es === e.fr && e.fr.split(/\s+/).length >= 3 && /[éèàçêù]|\b(le|la|les|des|du|une|vous|votre)\b/i.test(e.fr))
    .map(([k]) => k);
  check("Spanish values are not left in French", frenchInSpanish.length === 0, frenchInSpanish.slice(0, 8).join(", ") || "none");

  // A translation may leave a placeholder out (« un jour » needs no number)
  // but never use one the French source does not provide: it would show raw.
  const badPh = [...dict].filter(([, e]) => {
    const ref = new Set(placeholders(e.fr ?? "").split(",").filter(Boolean));
    return (["ar", "es", "en"] as const).some((l) => e[l] !== undefined && placeholders(e[l]!).split(",").filter(Boolean).some((x) => !ref.has(x)));
  }).map(([k]) => k);
  check("no translation uses a placeholder the source does not fill", badPh.length === 0, badPh.slice(0, 8).join(", ") || "none");

  // Keys used in the code with t("…") must exist.
  const files = walk(path.join(MOBILE, "app")).concat(walk(path.join(MOBILE, "components")), walk(path.join(MOBILE, "hooks")), walk(path.join(MOBILE, "context")), walk(path.join(MOBILE, "features")), walk(path.join(MOBILE, "lib")));
  const unknown = new Set<string>();
  let used = 0;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"\s*\)/g)) {
      used++;
      if (!dict.has(m[1])) unknown.add(`${m[1]} (${path.relative(MOBILE, f).replace(/\\/g, "/")})`);
    }
  }
  check("every t(\"key\") used in the code exists", unknown.size === 0, `${used} uses; missing: ${[...unknown].slice(0, 8).join(", ") || "none"}`);

  // Directional icons follow the reading direction.
  const feather = readFileSync(path.join(MOBILE, "components/ui/Feather.tsx"), "utf8");
  const mirror = Object.fromEntries([...feather.matchAll(/"([a-z-]+)":\s*"([a-z-]+)"/g)].map((m) => [m[1], m[2]]));
  check("chevrons and arrows are mirrored in Arabic", mirror["chevron-right"] === "chevron-left" && mirror["arrow-left"] === "arrow-right" && mirror["corner-up-left"] === "corner-up-right");
  check("non-directional icons are left alone", !("chevron-down" in mirror) && !("check" in mirror) && !("home" in mirror));
  const base = files.filter((f) => !f.endsWith(path.join("ui", "Feather.tsx")) && /from "@expo\/vector-icons"/.test(readFileSync(f, "utf8")) && /name="(chevron-right|chevron-left|arrow-right|arrow-left)"/.test(readFileSync(f, "utf8")));
  check("no screen draws a fixed-direction arrow with the raw icon set", base.length === 0, base.map((f) => path.relative(MOBILE, f)).slice(0, 6).join(", ") || "none");

  // Long strings (layout): report the longest per language (information).
  for (const l of ["fr", "ar", "es"] as const) {
    const longest = [...dict].map(([k, e]) => [k, (e[l] ?? "").length] as const).sort((a, b) => b[1] - a[1])[0];
    console.log(`INFO longest ${l} value: ${longest[0]} (${longest[1]} chars)`);
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} i18n checks passed`);
  if (failed) process.exit(1);
}

main();

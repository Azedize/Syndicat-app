/**
 * Official contact details stay unconfirmed until they are provided
 * (2026-10-25) — static checks:
 *
 *   pnpm --filter @workspace/scripts run contacts-config:test
 *
 * - no invented address (…@mizan.ma / .app / .com), legal name or realistic
 *   phone number is written in the app or the API;
 * - the contact details come only from configuration (EXPO_PUBLIC_* in the
 *   app, SUPPORT_EMAIL in the API) and are null when not configured;
 * - the privacy page reads them from there and says « à compléter » otherwise.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("..");
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(n)) out.push(p);
  }
  return out;
}

const files = [
  ...walk(path.join(ROOT, "artifacts/mobile/app")),
  ...walk(path.join(ROOT, "artifacts/mobile/components")),
  ...walk(path.join(ROOT, "artifacts/mobile/constants")),
  ...walk(path.join(ROOT, "artifacts/mobile/context")),
  ...walk(path.join(ROOT, "artifacts/mobile/features")),
  ...walk(path.join(ROOT, "artifacts/mobile/services")),
  ...walk(path.join(ROOT, "artifacts/mobile/hooks")),
  ...walk(path.join(ROOT, "artifacts/mobile/lib")),
  ...walk(path.join(ROOT, "artifacts/api-server/src")),
];
const INVENTED = /[a-z0-9._-]+@mizan\.(ma|app|com)\b|MIZAN Community OS/i;
// A Moroccan number that looks dialable (format examples made of zeros or X are fine).
const realisticPhone = (l: string) => [...l.matchAll(/\+212 ?([5-7](?: ?\d){8})\b/g)].some((m) => /[1-9]/.test(m[1].slice(1)));
const hits = files.flatMap((f) =>
  readFileSync(f, "utf8").split("\n").map((l, i) => ({ f, i, l })).filter(({ l }) => INVENTED.test(l) || realisticPhone(l)),
).map(({ f, i }) => `${path.relative(ROOT, f).replace(/\\/g, "/")}:${i + 1}`);
check("no invented address, legal name or realistic phone number in the code", hits.length === 0, hits.slice(0, 8).join(", ") || "none");

const contact = readFileSync(path.join(ROOT, "artifacts/mobile/constants/contact.ts"), "utf8");
const keys = ["EXPO_PUBLIC_CONTACT_EMAIL", "EXPO_PUBLIC_SUPPORT_EMAIL", "EXPO_PUBLIC_PRIVACY_EMAIL", "EXPO_PUBLIC_CONTACT_PHONE", "EXPO_PUBLIC_LEGAL_ENTITY"];
check("app: every contact detail comes from configuration", keys.every((k) => contact.includes(`process.env.${k}`)) && !/["'][^"']+@[^"']+["']/.test(contact));
const api = readFileSync(path.join(ROOT, "artifacts/api-server/src/lib/contact.ts"), "utf8");
check("API: the support address comes from SUPPORT_EMAIL only", api.includes("process.env.SUPPORT_EMAIL") && !/["'][^"']+@[^"']+["']/.test(api));
const privacy = readFileSync(path.join(ROOT, "artifacts/mobile/app/privacy.tsx"), "utf8");
check("privacy page: details read from configuration, « à compléter » otherwise", privacy.includes("CONTACT.privacyEmail ??") && privacy.includes("CONTACT.legalEntity ??") && /à compléter/.test(privacy));
const gs = readFileSync(path.join(ROOT, "artifacts/mobile/app/get-started.tsx"), "utf8");
check("sign-up page: the contact link only appears when configured", /CONTACT_EMAIL \?/.test(gs));
const doc = readFileSync(path.join(ROOT, "LOCAL_RUN_COMMANDS.md"), "utf8");
check("the variables are documented", [...keys, "SUPPORT_EMAIL"].every((k) => doc.includes(k)));

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} contact configuration checks passed`);
if (failed) process.exit(1);

/**
 * Server error messages in the reader's language (mission 4, 2026-11-08).
 *
 *   pnpm --filter @workspace/scripts run server-errors-i18n:test   (API on API_BASE_URL)
 *
 * Static part — the API sources of the priority modules:
 *   - every error message written in the code (literal or built with values)
 *     is in the catalogue (artifacts/api-server/src/lib/i18n/errors), except
 *     the internal ones listed below, which never reach a user;
 *   - every entry has an English and an Arabic text, the Arabic one in Arabic
 *     letters, and an UPPER_SNAKE code; patterns keep their {n} values.
 * Live part — the running API answers the same refusal in French, English
 * and Arabic with the same stable code, keeps a route's own code, and leaves
 * successful answers untouched.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const API_SRC = path.resolve("../artifacts/api-server/src");
const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
const { ERROR_CATALOG, translateError } = (await import(pathToFileURL(path.join(API_SRC, "lib/i18n/errors/index.ts")).href)) as typeof import("../../artifacts/api-server/src/lib/i18n/errors/index.js");
const { ERROR_PATTERNS: BASE_PATTERNS } = (await import(pathToFileURL(path.join(API_SRC, "lib/i18n/errors/patterns.ts")).href)) as typeof import("../../artifacts/api-server/src/lib/i18n/errors/patterns.js");
const { OPERATIONS_PATTERNS } = (await import(pathToFileURL(path.join(API_SRC, "lib/i18n/errors/patterns-operations.ts")).href)) as typeof import("../../artifacts/api-server/src/lib/i18n/errors/patterns-operations.js");
const ERROR_PATTERNS = [...BASE_PATTERNS, ...OPERATIONS_PATTERNS];

/** The template literal opening at `start` (a backtick), nested templates included. */
function templateAt(src: string, start: number): string {
  let depth = 0;
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") { i++; continue; }
    if (c === "$" && src[i + 1] === "{") { depth++; i++; continue; }
    if (c === "}" && depth > 0) { depth--; continue; }
    if (c === "`") {
      if (depth === 0) return src.slice(start + 1, i);
      const inner = templateAt(src, i); // a template inside ${…}
      i += inner.length + 1;
    }
  }
  return src.slice(start + 1);
}

const checks: boolean[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Modules whose messages must all be translated (mission 4 priority list) and the shared code. */
const PRIORITY = /^(app\.ts|lib\/|middleware\/|modules\/(auth|me|account|users|team|syndicates|organization|organizations|buildings|lots|members|locataires|finance|finance-building|treasury|allocation|budget|expenses|documents|document-library|attachments|storage|claims|reclamations|sinistres|meetings|ag|elections|governance|subscriptions|stripe|content|publications|audit|statistics)\/)/;

/** Messages that never reach a user: configuration, start-up, internal codes, developer tooling. */
const INTERNAL = new Set([
  "PRIVATE_OBJECT_DIR not set", "SMTP not configured", "undeliverable", "delivery_disabled", "delivery disabled",
  "FATAL: ALLOWED_ORIGINS environment variable must be set in production. ",
  "PRIVATE_OBJECT_DIR env var not set — cannot resolve logo path",
  "JWT_SECRET environment variable is required but was not provided. ",
  "JWT_SECRET must be at least 32 characters long for security.",
  "Query-string tokens must be GET download tickets", "Download tickets cannot be used as bearer tokens", "Document links are not session tokens",
  "code already used", "token already used",
  "NOT_FOUND", "NOT_OPEN", "FORBIDDEN", "NO_PROXY", "NOT_ELIGIBLE", "BAD_CANDIDATE", "NO_VOICES", "ALREADY_VOTED",
  ...["Header", "Footer", "Signature", "Verification", "Table", "InfoCard", "Kpi", "Certificate", "Governance", "Financial"].map((n) => `engine${n}: Phase 3 pending — provide reference image`),
]);
const INTERNAL_DYNAMIC = /^(logo fetch failed|Expo push responded|Unknown access group type|Object not found|Unsupported signed URL method)/;

// ── Static: sources ──
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".ts") && !f.endsWith(".test.ts")) files.push(p);
  }
};
walk(API_SRC);
const literals = new Map<string, string>();
const dynamics = new Map<string, string>();
const validations = new Map<string, string>();
for (const f of files) {
  const rel = path.relative(API_SRC, f).split(path.sep).join("/");
  if (!PRIORITY.test(rel) || rel.startsWith("lib/i18n/")) continue;
  const src = readFileSync(f, "utf8");
  for (const re of [/error:\s*"((?:[^"\\]|\\.)+)"/g, /error:\s*'((?:[^'\\]|\\.)+)'/g, /new (?:Error|HttpError|RouteError)\(\s*"((?:[^"\\]|\\.)+)"/g]) {
    for (const m of src.matchAll(re)) literals.set(m[1], rel);
  }
  for (const re of [/error:\s*`([^`]+)`/g, /new (?:Error|HttpError|RouteError)\(\s*`([^`]+)`/g]) {
    for (const m of src.matchAll(re)) (m[1].includes("${") ? dynamics : literals).set(m[1], rel);
  }
  // Refusals through the shared helpers: FinanceError, BankDetailsError, InvalidPhoneError,
  // fail(status, code, message), paymentError(res, code, message), election rule err(field, code, message).
  const HELPERS = /(?:new (?:FinanceError|BankDetailsError|InvalidPhoneError)\(\s*(?:\d+\s*,\s*)?(?:"[A-Z_]+"\s*,\s*)?|\bfail\(\s*\d{3}\s*,\s*"[A-Z_]+"\s*,\s*|paymentError\(\s*res\s*,\s*"[A-Z_]+"\s*,\s*|\berr\(\s*"[A-Za-z]+"\s*,\s*"[A-Z_]+"\s*,\s*)(["`])/g;
  for (const m of src.matchAll(HELPERS)) {
    const at = (m.index ?? 0) + m[0].length - 1;
    if (m[1] === '"') {
      const lit = /^"((?:[^"\\]|\\.)+)"/.exec(src.slice(at))?.[1];
      if (lit && !/^[A-Z_]+$/.test(lit)) literals.set(lit, rel);
    } else {
      const tpl = templateAt(src, at);
      (tpl.includes("${") ? dynamics : literals).set(tpl, rel);
    }
  }
  // Messages of the request schemas (answered as `{ error: issues[0].message }`).
  for (const m of src.matchAll(/\.(?:min|max|email|regex|refine|length|url|nonempty|positive|nonnegative|int|gte|lte|gt|lt)\((?:[^()"]|\([^()]*\))*?"((?:[^"\\]|\\.)+)"\s*\)/g)) validations.set(m[1], rel);
  // Refusals thrown as { status: 4xx, message } or added as schema issues.
  for (const m of src.matchAll(/message:\s*"((?:[^"\\]|\\.)+)"/g)) {
    const around = src.slice(Math.max(0, (m.index ?? 0) - 300), (m.index ?? 0) + 200);
    if (/status:\s*4\d\d|\.refine\(|\.superRefine\(|addIssue\(/.test(around)) validations.set(m[1], rel);
  }
  for (const m of src.matchAll(/message:\s*`([^`]+)`/g)) {
    const around = src.slice(Math.max(0, (m.index ?? 0) - 300), (m.index ?? 0) + 200);
    if (/status:\s*4\d\d|\.refine\(|\.superRefine\(|addIssue\(/.test(around)) (m[1].includes("${") ? dynamics : validations).set(m[1], rel);
  }
}

const missing = [...literals].filter(([s]) => !INTERNAL.has(s) && !translateError(s, "en"));
check(`every error message of the priority modules is translated (${literals.size - missing.length}/${literals.size}, ${[...literals.keys()].filter((s) => INTERNAL.has(s)).length} internal)`, missing.length === 0,
  missing.slice(0, 15).map(([s, f]) => `${f}: « ${s} »`).join(" | "));

const valMissing = [...validations].filter(([s]) => /[a-zà-ÿ]{3}/i.test(s) && !translateError(s, "en"));
check(`every validation message of the request schemas is translated (${validations.size - valMissing.length}/${validations.size})`, valMissing.length === 0,
  valMissing.slice(0, 15).map(([s, f]) => `${f}: « ${s} »`).join(" | "));
for (const [sample, expected] of [["Required", "A required field is missing."], ["String must contain at least 2 character(s)", "Text too short (2 character(s) minimum)."], ["Expected string, received number", "Invalid data."]] as const) {
  check(`default validation text « ${sample} » becomes « ${expected} »`, translateError(sample, "en")?.error === expected, translateError(sample, "en")?.error);
}

// A message built with values: substitute plausible values and expect a pattern to recognise it.
// A condition (`a ? "x" : "y"`) takes its first branch, a nested template is filled in turn,
// a few variables get a realistic value, any other value becomes « 12 ».
const HINTS: Record<string, string> = { what: "Le syndic", from: "open", to: "closed", next: "active" };
function sample(tpl: string): string {
  let out = "";
  for (let i = 0; i < tpl.length; i++) {
    if (tpl[i] === "$" && tpl[i + 1] === "{") {
      let depth = 1, j = i + 2;
      for (; j < tpl.length && depth; j++) {
        if (tpl[j] === "`") j += templateAt(tpl, j).length + 1;
        else if (tpl[j] === "{") depth++;
        else if (tpl[j] === "}") depth--;
      }
      const expr = tpl.slice(i + 2, j - 1).trim();
      const branch = /\?\s*(?:"([^"]*)"|`([^`]*)`)\s*:/.exec(expr);
      if (branch) out += branch[1] !== undefined ? branch[1] : sample(branch[2]);
      else if (/toISOString|Date|leaseStart|latestStart|effectiveFrom|openingDate/.test(expr)) out += "2026-01-31";
      else if (/\.join\(/.test(expr)) out += "admin, bank_fees";
      else if (/^[\w.]+$/.test(expr) && HINTS[expr.split(".").pop()!]) out += HINTS[expr.split(".").pop()!];
      else out += "12";
      i = j - 1;
    } else out += tpl[i];
  }
  return out;
}
const dynMissing = [...dynamics].filter(([s]) => !INTERNAL_DYNAMIC.test(s) && !translateError(sample(s), "en"));
check(`every message built with values is recognised (${dynamics.size - dynMissing.length}/${dynamics.size})`, dynMissing.length === 0,
  dynMissing.map(([s, f]) => `${f}: « ${s} »`).join(" | "));

// ── Static: catalogue quality ──
const ARABIC = /[؀-ۿ]/;
const entries = Object.entries(ERROR_CATALOG);
const bad = entries.filter(([, [code, en, ar]]) => !/^[A-Z][A-Z0-9_]+$/.test(code) || !en.trim() || !ar.trim() || !ARABIC.test(ar) || /[éèàù]/.test(en));
check(`every catalogue entry has a code, an English text and an Arabic text (${entries.length} messages, ${new Set(entries.map(([, e]) => e[0])).size} codes)`, bad.length === 0, bad.slice(0, 8).map(([k]) => k).join(" | "));
const placeholders = (s: string) => (s.match(/\{\d\}/g) ?? []).sort().join();
const badPatterns = ERROR_PATTERNS.filter(([, code, fr, en, ar]) => !/^[A-Z_]+$/.test(code) || placeholders(fr) !== placeholders(en) || placeholders(fr) !== placeholders(ar) || !ARABIC.test(ar));
check(`patterns keep the same values in the three languages (${ERROR_PATTERNS.length} patterns)`, badPatterns.length === 0, badPatterns.map((p) => p[1]).join(" | "));
const unused = entries.filter(([k]) => ![...literals.keys()].includes(k) && !files.some((f) => readFileSync(f, "utf8").includes(k)));
check("every catalogue message is still used by the API", unused.length === 0, unused.slice(0, 10).map(([k]) => `« ${k} »`).join(" | "));

// ── Live ──
const post = async (p: string, body: unknown, lang: string) => {
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": lang }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
};
const answers = await Promise.all(["fr-FR", "en", "ar"].map((l) => post("/auth/login", { email: "nobody.mission4@example.invalid", password: "wrong-password-1" }, l)));
check("a refusal is answered in French, English and Arabic with the same code",
  answers.every((a) => a.status === 401 && a.body?.code === "INVALID_CREDENTIALS") &&
    answers[0].body.error === "Email ou mot de passe incorrect" && answers[1].body.error === "Incorrect email or password." && ARABIC.test(answers[2].body.error),
  answers.map((a) => `${a.status} ${a.body?.code} « ${a.body?.error} »`).join(" | "));
const es = await post("/auth/login", { email: "nobody.mission4@example.invalid", password: "wrong-password-1" }, "es");
check("Spanish readers get the English text", es.body?.error === "Incorrect email or password.", es.body?.error);
const own = await post("/auth/otp/send", { email: "reserved.mission4@example.invalid" }, "en");
check("a route's own code is kept and its message translated", own.status === 400 && own.body?.code === "EMAIL_UNDELIVERABLE" && /cannot receive messages/.test(own.body?.error ?? ""), `${own.status} ${own.body?.code} « ${own.body?.error} »`);
const noLang = await post("/auth/login", { email: "nobody.mission4@example.invalid", password: "wrong-password-1" }, "");
check("without a language, the French text is kept", noLang.body?.error === "Email ou mot de passe incorrect", noLang.body?.error);
const health = await fetch(`${BASE}/healthz`).then((r) => r.status).catch(() => 0);
const health2 = health === 200 ? 200 : await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
check("successful answers are untouched", health2 === 200, String(health2));

const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} server error language checks passed`);
process.exit(passed === checks.length ? 0 : 1);

/**
 * Defects found on the Android emulator during the final campaign
 * (2026-11-09) — no server, no database:
 *
 *   pnpm --filter @workspace/scripts run final-fixes:test
 *
 * - the automatic overdue reminder is a translated template (it was stored
 *   in French with a raw amount « 700.05 » and a raw date « 2026-07-31 »);
 *   amounts in notifications follow the reader's language;
 * - the partners screen survived neither an unknown type (« commerce ») nor a
 *   partner without status: both now fall back instead of crashing;
 * - the organisation chart failed as a whole for a platform administrator
 *   without supervision mode, although the national view answered;
 * - allocation key versions showed « dès 2026-01-01 »;
 * - « 1 partenariats actifs » / « Payés » on a single item;
 * - two SMS routes answered a 500 with the raw exception text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve("..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const checks: boolean[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const nt = (await import(pathToFileURL(path.join(ROOT, "artifacts/api-server/src/lib/notification-texts.ts")).href)) as any;
const params = { period: "2026-Q3", amount: "700.05", dueDate: "2026-07-31" };
const fr = nt.renderNotification("fundsCall.overdue", params, "fr");
const en = nt.renderNotification("fundsCall.overdue", params, "en");
const ar = nt.renderNotification("fundsCall.overdue", params, "ar");
check("overdue reminder in French: amount « 700,05 », date « 31 juillet 2026 »", !!fr && /700,05 MAD/.test(fr.message) && /31 juillet 2026/.test(fr.message), fr?.message);
check("overdue reminder in English", !!en && /700\.05 MAD/.test(en.message) && /31 July 2026/.test(en.message), en?.message);
check("overdue reminder in Arabic", !!ar && /[؀-ۿ]/.test(ar.message) && /700[.,٫]05/.test(ar.message), ar?.message);
const funds = read("artifacts/api-server/src/lib/funds-calls.ts");
check("reminders are sent through the template, not as French text", funds.includes('key: "fundsCall.overdue"') && !funds.includes("restent dus"));

const partners = read("artifacts/mobile/app/partenaires.tsx");
check("partners: unknown type falls back to « other »", partners.includes("TYPE_CONFIG.autre") && !/TYPE_CONFIG\[(selectedPartner|partner)\.type\]/.test(partners));
check("partners: a partner without status gets one from its end date", /STATUS_CFG\[p\.status\] \? p :/.test(partners));
check("generator writes a partner type the app knows", read("scripts/src/seedgen/generate.ts").includes('type: "commercial", sector: "services"'));

const org = read("artifacts/mobile/app/organigramme.tsx");
check("organisation chart: the condominium view may fail without hiding the national view", org.includes("Promise.allSettled") && org.includes("isSuperAdmin && natRes"));

check("allocation versions: dates in the reader's language", read("artifacts/mobile/app/repartition.tsx").includes("formatDay(lang, v.effectiveFrom)"));

const tr = read("artifacts/mobile/i18n/translations.ts");
for (const key of ["paidOne", "partnerActiveCountOne"]) {
  const m = new RegExp(`\\b${key}: \\{ fr: "[^"]+", en: "[^"]+", ar: "[^"]+", es: "[^"]+" \\}`).exec(tr);
  check(`singular label « ${key} » in four languages`, !!m);
}

const auth = read("artifacts/api-server/src/modules/auth/auth.routes.ts");
check("no raw exception text in a 500 answer of the auth routes", !/status\(5\d\d\)\.json\(\{\s*error:\s*err\??\.message/.test(auth));

const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} final-campaign fix checks passed`);
process.exit(passed === checks.length ? 0 : 1);

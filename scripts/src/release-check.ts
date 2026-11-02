/**
 * Google Play pre-release check. Reads the Android configuration and refuses a production build
 * that could not work. It never builds, publishes or sends anything.
 *
 * The production API address comes from EXPO_PUBLIC_API_URL, or from the production profile of
 * eas.json. When one is set, its public endpoints are called (GET only).
 *
 *   pnpm --filter @workspace/scripts run release:check
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const MOBILE = join(ROOT, "artifacts", "mobile");

const app = JSON.parse(readFileSync(join(MOBILE, "app.json"), "utf8")).expo;
const eas = JSON.parse(readFileSync(join(MOBILE, "eas.json"), "utf8"));

// Permissions nothing in the app uses: declaring them would have to be justified to Google Play.
const FORBIDDEN_PERMISSIONS = [
  "android.permission.RECORD_AUDIO",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.USE_EXACT_ALARM",
  "android.permission.MANAGE_EXTERNAL_STORAGE",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.READ_CONTACTS",
];
const SIGNING_FILES = /\.(jks|keystore|p12|pem|aab|apk)$|service-account/i;

let blockers = 0;
const report = (ok: boolean, label: string, detail = "") => {
  if (!ok) blockers++;
  console.log(`${ok ? "OK      " : "BLOQUANT"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

export function apiUrlProblem(raw: string | undefined): string | null {
  if (!raw?.trim()) return "aucune adresse d'API de production";
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "adresse illisible";
  }
  if (url.protocol !== "https:") return "HTTPS obligatoire";
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) return "adresse locale";
  if (/(trycloudflare\.com|ngrok|exp\.direct)$/i.test(url.hostname)) return "tunnel temporaire";
  if (!/\/api\/?$/.test(url.pathname)) return "doit se terminer par /api";
  return null;
}

async function probe(url: string): Promise<number | string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
    return res.status;
  } catch (err) {
    return (err as Error).message;
  }
}

async function main() {
  console.log("— Identité de l'application");
  report(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(app.android?.package ?? ""), "identifiant Android", app.android?.package);
  report(Number.isInteger(app.android?.versionCode) && app.android.versionCode > 0, "versionCode", String(app.android?.versionCode));
  report(/^\d+\.\d+\.\d+$/.test(app.version ?? ""), "version", app.version);
  report(Boolean(app.extra?.eas?.projectId), "projet EAS", app.extra?.eas?.projectId ?? "absent : à créer avec le compte Expo du propriétaire");
  report(existsSync(join(MOBILE, app.android?.googleServicesFile ?? "google-services.json")), "configuration Firebase présente");

  console.log("— Informations légales");
  // The privacy screen shows « à compléter » without these two values.
  for (const name of ["EXPO_PUBLIC_LEGAL_ENTITY", "EXPO_PUBLIC_PRIVACY_EMAIL"]) {
    const value = process.env[name] || eas.build?.production?.env?.[name];
    report(Boolean(value?.trim()), name, value?.trim() ? "" : "absent : la politique de confidentialité afficherait « à compléter »");
  }

  console.log("— Android");
  report(app.android?.allowBackup === false, "sauvegarde automatique Android coupée");
  const manifest = execFileSync("npx", ["expo", "config", "--type", "introspect", "--json"], {
    cwd: MOBILE,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const declared: { $: Record<string, string> }[] =
    JSON.parse(manifest)._internal?.modResults?.android?.manifest?.manifest?.["uses-permission"] ?? [];
  report(declared.length > 0, "manifeste calculé par Expo lu");
  const kept = new Set(declared.filter((p) => p.$["tools:node"] !== "remove").map((p) => p.$["android:name"]));
  const unwanted = FORBIDDEN_PERMISSIONS.filter((p) => kept.has(p));
  report(unwanted.length === 0, "aucune permission inutile", unwanted.join(", "));
  console.log(`          permissions déclarées par l'application : ${[...kept].map((p) => p.replace("android.permission.", "")).join(", ")}`);

  console.log("— Secrets");
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n");
  const signing = tracked.filter((f) => SIGNING_FILES.test(f));
  report(signing.length === 0, "aucune clé de signature ni compte de service suivis par Git", signing.join(", "));
  report(!tracked.some((f) => /(^|\/)\.env$/.test(f)), ".env non suivi par Git");

  console.log("— API de production");
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || eas.build?.production?.env?.EXPO_PUBLIC_API_URL;
  const problem = apiUrlProblem(apiUrl);
  report(!problem, "adresse de l'API", problem ?? apiUrl);
  if (!problem) {
    const base = apiUrl.trim().replace(/\/+$/, "");
    const health = await probe(`${base}/healthz`);
    report(health === 200, "API joignable", `GET /healthz → ${health}`);
    // Google Play requires a public link to request the deletion of an account.
    const deletion = await probe(`${base}/account-deletion`);
    report(deletion === 200, "page publique de suppression de compte", `GET /account-deletion → ${deletion}`);
  }

  console.log("");
  if (blockers) {
    console.log(`${blockers} point(s) bloquant(s) : ne pas publier cette version.`);
    process.exit(1);
  }
  console.log("Aucun point bloquant dans ces contrôles. Ils ne remplacent pas un essai sur un téléphone réel.");
}

await main();

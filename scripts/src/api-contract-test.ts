/**
 * Every API call written in the mobile app must match a route declared by the server (2026-11-04).
 * Static, no server needed:
 *
 *   pnpm --filter @workspace/scripts run api-contract:test
 *
 * This found buttons that had never worked: a route that did not exist, or the wrong verb.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "artifacts");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "android" || e.name === "ios" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const segments = (p: string) => p.split("/").filter(Boolean);
const routes: { method: string; parts: string[] }[] = [];
for (const f of walk(join(ROOT, "api-server", "src"))) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/\brouter\.(get|post|put|patch|delete|all)\(\s*["'`]([^"'`]+)["'`]/g)) {
    routes.push({ method: m[1].toUpperCase(), parts: segments(m[2]) });
  }
}

/** The first argument when it is a string or a template, nested templates included. */
function readPath(s: string, start: number): { text: string; end: number } | null {
  const quote = s[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let text = "";
  let i = start + 1;
  while (i < s.length && s[i] !== quote) {
    if (quote === "`" && s[i] === "$" && s[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < s.length && depth > 0) {
        if (s[i] === "{") depth++;
        else if (s[i] === "}") depth--;
        i++;
      }
      text += "\u0000";
      continue;
    }
    text += s[i++];
  }
  return { text, end: i + 1 };
}

const calls: { where: string; raw: string; method: string }[] = [];
for (const f of walk(join(ROOT, "mobile"))) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/\b(apiRequest|libApiRequest|request)(?:<(?:[^<>()]|<[^<>()]*>)*>)?\(\s*/g)) {
    const start = m.index + m[0].length;
    const path = readPath(s, start);
    if (!path || !path.text.startsWith("/")) continue;
    const verb = /^\s*,\s*(?:["'](GET|POST|PUT|PATCH|DELETE)["']|\{[^{}]*?method:\s*["'](GET|POST|PUT|PATCH|DELETE)["'])/.exec(s.slice(path.end, path.end + 400));
    calls.push({
      where: `${relative(join(ROOT, "mobile"), f).replace(/\\/g, "/")}:${s.slice(0, start).split("\n").length}`,
      raw: path.text.replace(/\u0000/g, "${…}"),
      method: verb?.[1] ?? verb?.[2] ?? "GET",
    });
  }
}

const problems: string[] = [];
// The API address is resolved in one place: elsewhere it breaks with the production configuration.
for (const f of walk(join(ROOT, "mobile"))) {
  const where = relative(join(ROOT, "mobile"), f).split("\\").join("/");
  if (where === "services/api/client.ts" || where === "lib/login-transport.ts") continue;
  if (/EXPO_PUBLIC_(DOMAIN|API_URL|API_PORT)/.test(readFileSync(f, "utf8"))) problems.push(`API address built outside services/api/client.ts: ${where}`);
}
let checked = 0;
for (const c of calls) {
  // A query string written as a template is not part of the path; template-studio adds its own /api.
  // A whole ${…} segment can be any value; one glued to a word (/x${query}) is a query string.
  const parts = segments(c.raw.replace(/^\/api\//, "/").split("?")[0].replace(/([^/])\$\{…\}$/, "$1"));
  checked++;
  const hits = routes.filter(
    (r) => r.parts.length === parts.length && r.parts.every((seg, i) => seg.startsWith(":") || parts[i] === "${…}" || seg === parts[i]),
  );
  if (!hits.length) problems.push(`no route: ${c.method} ${c.raw} ← ${c.where}`);
  else if (!hits.some((r) => r.method === c.method || r.method === "ALL")) problems.push(`wrong verb: ${c.method} ${c.raw} (server: ${[...new Set(hits.map((h) => h.method))].join(", ")}) ← ${c.where}`);
}

if (routes.length < 300 || calls.length < 300) problems.push(`scan looks broken: ${routes.length} routes, ${calls.length} calls in ${basename(ROOT)}`);
for (const p of problems) console.log(`FAIL ${p}`);
console.log(`${checked - problems.length}/${checked} mobile API calls match a server route (${routes.length} routes)`);
process.exit(problems.length ? 1 : 0);

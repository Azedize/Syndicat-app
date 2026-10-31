/**
 * Every navigation target written in the mobile app resolves to a screen
 * (2026-10-25). A button that pushes a path with no file under app/ lands on
 * « Page introuvable »; this static check finds them before a user does.
 *
 *   pnpm --filter @workspace/scripts run routes-resolve:test
 *
 * Targets read: router.push/replace/navigate("…"), href="…", pathname: "…",
 * route: "…" in menus. Dynamic segments ([id]) and groups ((tabs)) follow
 * expo-router's rules; query strings and template parts are ignored.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const APP = path.resolve(process.cwd(), "../artifacts/mobile/app");
const SRC = [APP, path.resolve(process.cwd(), "../artifacts/mobile/components"), path.resolve(process.cwd(), "../artifacts/mobile/hooks"), path.resolve(process.cwd(), "../artifacts/mobile/lib"), path.resolve(process.cwd(), "../artifacts/mobile/context"), path.resolve(process.cwd(), "../artifacts/mobile/constants")];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e)) out.push(p);
  }
  return out;
}

// ── Routes that exist ──
type Route = { segs: string[] };
const routes: Route[] = [];
for (const f of walk(APP)) {
  const rel = path.relative(APP, f).split(path.sep).join("/").replace(/\.(tsx?|jsx?)$/, "");
  const parts = rel.split("/");
  const last = parts[parts.length - 1];
  if (last.startsWith("_layout") || last.startsWith("+")) continue;
  // Groups do not appear in the URL; index is the folder itself.
  const segs = parts.filter((s) => !/^\(.*\)$/.test(s));
  if (segs[segs.length - 1] === "index") segs.pop();
  routes.push({ segs });
}
const resolves = (target: string) => {
  const clean = target.split(/[?#]/)[0].replace(/\/+$/, "");
  const segs = clean.split("/").filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
  return routes.some((r) => r.segs.length === segs.length && r.segs.every((s, i) => s === segs[i] || /^\[.+\]$/.test(s) || segs[i] === "__param__"));
};

// ── Targets written in the code ──
const PATTERNS = [
  /router\.(?:push|replace|navigate)\(\s*["'`](\/[^"'`]*)["'`]/g,
  /\bhref\s*=\s*\{?\s*["'`](\/[^"'`]*)["'`]/g,
  /\bhref\s*:\s*["'`](\/[^"'`]*)["'`]/g,
  /\bpathname\s*:\s*["'`](\/[^"'`]*)["'`]/g,
  /\broute\s*:\s*["'`](\/[^"'`]*)["'`]/g,
  /<Redirect\s+href=\{?\s*["'`](\/[^"'`]*)["'`]/g,
];
const broken: { file: string; line: number; target: string }[] = [];
let total = 0;
for (const dir of SRC) {
  for (const f of walk(dir)) {
    const text = readFileSync(f, "utf8");
    for (const re of PATTERNS) {
      for (const m of text.matchAll(re)) {
        // Template literals: ${…} parts are parameters.
        const target = m[1].replace(/\$\{[^}]*\}/g, "__param__");
        if (/^https?:/.test(target) || target.startsWith("//")) continue;
        total++;
        if (!resolves(target)) {
          const line = text.slice(0, m.index).split("\n").length;
          broken.push({ file: path.relative(path.resolve(process.cwd(), ".."), f).split(path.sep).join("/"), line, target: m[1] });
        }
      }
    }
  }
}

console.log(`${routes.length} screens, ${total} navigation targets read`);
for (const b of broken) console.log(`FAIL ${b.file}:${b.line} → ${b.target} (no screen)`);
console.log(`\n${total - broken.length}/${total} navigation targets resolve to a screen`);
if (broken.length) process.exit(1);

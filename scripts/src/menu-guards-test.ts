/**
 * The menu and the home shortcuts never offer a role a screen whose own guard
 * (RoleGuard / useRequireRole) sends that role back to the dashboard (2026-11-08).
 * Static, no server needed:
 *
 *   pnpm --filter @workspace/scripts run menu-guards:test
 *
 * Found on the emulator: treasurer, secretary, president and council member
 * tapped « Platform support », « Escalation », « Statistics », « Legal alerts »
 * or « Template requests » and landed on the home screen.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as menuModule from "../../artifacts/mobile/constants/menu";

const MOBILE = resolve(import.meta.dirname, "..", "..", "artifacts", "mobile");
const MENU = ((menuModule as any).MENU_SECTIONS_DEF ?? (menuModule as any).default?.MENU_SECTIONS_DEF) as { items: { route: string; roles: string[] }[] }[];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const guards = new Map<string, Set<string>>();
for (const f of walk(join(MOBILE, "app"))) {
  const s = readFileSync(f, "utf8");
  const found = [...s.matchAll(/(?:<RoleGuard[^>]*allow=\{|useRequireRole\()\[([^\]]*)\]/g)];
  if (!found.length) continue;
  const route = f.slice(join(MOBILE, "app").length).split("\\").join("/").replace(/\.tsx$/, "");
  guards.set(route, new Set(found.flatMap((m) => (m[1].match(/"[a-z_]+"/g) ?? []).map((x) => x.slice(1, -1)))));
}

const problems: string[] = [];
let checked = 0;
for (const section of MENU) {
  for (const item of section.items) {
    const allow = guards.get(item.route);
    if (!allow) continue;
    for (const role of item.roles) {
      checked++;
      if (!allow.has(role)) problems.push(`menu offers ${item.route} to ${role}, its guard allows ${[...allow].join(", ")}`);
    }
  }
}

const home = readFileSync(join(MOBILE, "app", "(tabs)", "index.tsx"), "utf8");
const LISTS: Record<string, string> = { SUPER: "super_admin", ADMIN: "syndicate_admin", PRESIDENT: "president", TREASURER: "treasurer", SECRETARY: "secretary", COMMITTEE: "committee_member", MEMBER: "member", TENANT: "tenant" };
for (const [name, role] of Object.entries(LISTS)) {
  const start = home.indexOf(`const QUICK_ACTIONS_${name} = [`);
  if (start < 0) {
    problems.push(`home shortcuts QUICK_ACTIONS_${name} not found`);
    continue;
  }
  const body = home.slice(start, home.indexOf("];", start));
  for (const m of body.matchAll(/route: "([^"]+)"/g)) {
    const allow = guards.get(m[1]);
    if (!allow) continue;
    checked++;
    if (!allow.has(role)) problems.push(`home shortcut ${m[1]} offered to ${role}, its guard allows ${[...allow].join(", ")}`);
  }
}

for (const p of problems) console.log(`FAIL ${p}`);
console.log(`\n${checked - problems.length}/${checked} menu and shortcut entries open their screen (${guards.size} guarded screens)`);
process.exit(problems.length ? 1 : 0);

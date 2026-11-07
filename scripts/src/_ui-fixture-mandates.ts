// Temporary UI fixture (isolated test base only): elects a syndic and an adjoint in
// « Résidence Riad Salam Anfa 22 » through the real API, to test the resignation screens.
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";

if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("test base only");
const BASE = "http://localhost:5056/api";
type U = { id: string; email: string; role: string; syndicate_id: string; name: string };
const tok = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicate_id, name: u.name }, process.env.JWT_SECRET!, { expiresIn: "15m" });
const api = async (u: U, m: string, p: string, b?: unknown) => {
  const r = await fetch(BASE + p, { method: m, headers: { Authorization: `Bearer ${tok(u)}`, "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
};
const [admin] = (await pool`SELECT id, email, role, syndicate_id, name FROM users WHERE email = 'syndicate.admin0.1781@s20261019.seedgen.mizan.test'`) as unknown as U[];
const owners = (await pool`SELECT id, email, role, syndicate_id, name FROM users WHERE syndicate_id = ${admin.syndicate_id} AND role = 'member' AND status = 'active' ORDER BY email`) as unknown as U[];
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
async function elect(type: "syndic" | "vice_syndic", candidate: U) {
  const e = (await api(admin, "POST", "/elections", { title: `${type === "syndic" ? "Syndic" : "Syndic adjoint"} — essai d'interface`, electionType: type, candidacyStart: day(-3), candidacyEnd: day(-2), startDate: day(-1), endDate: day(7) })).json?.data;
  await api(admin, "POST", `/elections/${e.id}/transition`, { action: "open_candidacy" });
  const c = (await api(candidate, "POST", `/elections/${e.id}/candidates`, {})).json?.data;
  await api(admin, "PUT", `/elections/${e.id}/candidates/${c.id}/validate`, { decision: "approved" });
  await api(admin, "POST", `/elections/${e.id}/transition`, { action: "start_campaign" });
  await api(admin, "POST", `/elections/${e.id}/transition`, { action: "open_voting" });
  let ok = 0;
  for (const o of owners) if ((await api(o, "POST", `/elections/${e.id}/vote`, { candidateIds: [c.id] })).status === 200) ok++;
  await api(admin, "POST", `/elections/${e.id}/transition`, { action: "close_voting" });
  const pub = await api(admin, "POST", `/elections/${e.id}/transition`, { action: "publish_results" });
  console.log(type, "→", candidate.name, candidate.email, "| bulletins", ok, "| issue", pub.json?.outcome);
}
await elect("syndic", owners[0]);
await elect("vice_syndic", owners[1]);
await pool.end();

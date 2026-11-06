/**
 * Budget amounts (2026-10-23). The execution report, the calls for funds and
 * the allocation read a budget as « lines = charges, total = charges +
 * reserve ». The API used to store whatever it received: a budget created
 * with charges only had a total of 0, an amount like "abc" crashed with a
 * 500, and lines could disagree with the charges.
 *
 * Every budget this test creates is deleted at the end (by id).
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { pool } from "@workspace/db";
import { TEST_EMAIL_LIKE, writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const PASSWORD = "MizanTest#2026";
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const created: string[] = [];

async function main() {
  // 1. The rule itself
  const mod = await import(pathToFileURL(path.resolve("../artifacts/api-server/src/modules/budget/budget.service.ts")).href).catch((e) => { console.log("import error:", String(e).slice(0, 200)); return null; });
  if (mod?.reconcileBudgetAmounts) {
    const r = mod.reconcileBudgetAmounts;
    const a = r({ chargesAmount: "1000.10", fondsReserve: "100.20" });
    check("total derived from charges + reserve, to the cent", a.ok && a.totalAmount === "1100.30", JSON.stringify(a));
    const b = r({ linesTotal: "300.00" });
    check("charges derived from the lines", b.ok && b.chargesAmount === "300.00" && b.totalAmount === "300.00");
    check("lines ≠ charges refused", !r({ chargesAmount: "72000.00", fondsReserve: "14400.00", linesTotal: "86400.00" }).ok);
    check("total ≠ charges + reserve refused", !r({ totalAmount: "1.00", chargesAmount: "2.00" }).ok);
    check("0.1 + 0.2 does not drift", r({ chargesAmount: "0.10", fondsReserve: "0.20", totalAmount: "0.30" }).ok);
  } else {
    // A rule that cannot be loaded is a failure, not a skip.
    check("budget rule module importable (modules/budget/budget.service.ts)", false);
  }

  // 2. Through the API, as the syndic of a generated residence
  const [syndic] = (await (pool as any).unsafe(`
    SELECT u.email, b.id AS building_id FROM users u
    JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active' AND s.creation_key LIKE 'seedgen:%'
    JOIN LATERAL (SELECT 1) ss ON ${writableSubscriptionSql("s")}
    JOIN buildings b ON b.syndicate_id = s.id
    WHERE u.role = 'syndicate_admin' AND u.status = 'active' AND u.email LIKE '${TEST_EMAIL_LIKE}'
    ORDER BY u.email LIMIT 1`)) as { email: string; building_id: string }[];
  if (!syndic) throw new Error("fixture: no generated syndic");
  const login = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: syndic.email, password: PASSWORD }) });
  const token = ((await login.json()) as any)?.data?.token;
  if (!token) throw new Error(`login ${syndic.email}: ${login.status}`);
  const api = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(`${BASE}${p}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = (await res.json().catch(() => null)) as any;
    const id = json?.id ?? json?.data?.id;
    if (method === "POST" && p === "/budgets" && res.status === 201 && id) created.push(id);
    return { status: res.status, json };
  };
  const year = 2099;

  const plain = await api("POST", "/budgets", { year, buildingId: syndic.building_id, chargesAmount: 48000, fondsReserve: 4800 });
  check("charges + reserve only: total stored as their sum (was 0)", plain.status === 201 && plain.json?.totalAmount === "52800.00", `${plain.status} total=${plain.json?.totalAmount}`);

  const withLines = await api("POST", "/budgets", {
    year, buildingId: syndic.building_id, fondsReserve: "1000.00",
    lines: [{ category: "entretien", label: "Nettoyage", amountAnnual: "1200.50" }, { category: "eau", label: "Eau", amountAnnual: "799.50" }],
  });
  check("lines only: charges = sum of lines, total = charges + reserve", withLines.status === 201 && withLines.json?.chargesAmount === "2000.00" && withLines.json?.totalAmount === "3000.00", `${withLines.status} ${withLines.json?.chargesAmount}/${withLines.json?.totalAmount}`);

  const reserveAsLine = await api("POST", "/budgets", {
    year, buildingId: syndic.building_id, chargesAmount: "1000.00", fondsReserve: "200.00",
    lines: [{ category: "entretien", label: "Entretien", amountAnnual: "1000.00" }, { category: "reserves", label: "Fonds de réserve", amountAnnual: "200.00" }],
  });
  check("reserve counted again as a line: refused", reserveAsLine.status === 400 && reserveAsLine.json?.code === "BUDGET_TOTALS_MISMATCH", String(reserveAsLine.status));

  const wrongTotal = await api("POST", "/budgets", { year, buildingId: syndic.building_id, totalAmount: "10.00", chargesAmount: "20.00" });
  check("total that contradicts charges + reserve: refused", wrongTotal.status === 400 && wrongTotal.json?.code === "BUDGET_TOTALS_MISMATCH", String(wrongTotal.status));

  const garbage = await api("POST", "/budgets", { year, buildingId: syndic.building_id, chargesAmount: "abc" });
  check("non-numeric amount: 400, not a server error", garbage.status === 400, String(garbage.status));

  const negative = await api("POST", "/budgets", { year, buildingId: syndic.building_id, chargesAmount: "-100.00" });
  check("negative amount: refused", negative.status === 400, String(negative.status));
  const tooPrecise = await api("POST", "/budgets", { year, buildingId: syndic.building_id, chargesAmount: "10.005" });
  check("more than 2 decimals: refused (no silent rounding)", tooPrecise.status === 400, String(tooPrecise.status));
  const nulls = await api("POST", "/budgets", { year, buildingId: syndic.building_id, chargesAmount: null, fondsReserve: null });
  check("null amounts: refused, not stored as 0 by accident", nulls.status === 400, String(nulls.status));
  const empty = await api("POST", "/budgets", { year, buildingId: syndic.building_id });
  check("no amount at all: an empty draft at 0.00 (explicit)", empty.status === 201 && empty.json?.totalAmount === "0.00", `${empty.status} ${empty.json?.totalAmount}`);
  const cents = await api("POST", "/budgets", { year, buildingId: syndic.building_id, chargesAmount: "0.10", fondsReserve: "0.20" });
  check("0.10 + 0.20 = 0.30 exactly", cents.status === 201 && cents.json?.totalAmount === "0.30", `${cents.status} ${cents.json?.totalAmount}`);
  const badLine = await api("POST", "/budgets", { year, buildingId: syndic.building_id, lines: [{ category: "x", label: "y", amountAnnual: "-1" }] });
  check("negative budget line: refused", badLine.status === 400, String(badLine.status));

  // An approved budget's amounts cannot change (a new AG decision is needed).
  const [approved] = (await (pool as any).unsafe(`SELECT b.id FROM budgets b WHERE b.status = 'approved' AND b.building_id = $1 LIMIT 1`, [syndic.building_id])) as { id: string }[];
  if (approved) {
    const locked = await api("PUT", `/budgets/${approved.id}`, { fondsReserve: "1.00" });
    check("approved budget: amounts locked (409)", locked.status === 409, String(locked.status));
  }

  if (withLines.status === 201) {
    const id = withLines.json.id;
    const badPut = await api("PUT", `/budgets/${id}`, { chargesAmount: "5000.00" });
    check("draft: charges changed away from its lines refused", badPut.status === 400 && badPut.json?.code === "BUDGET_TOTALS_MISMATCH", String(badPut.status));
    const goodPut = await api("PUT", `/budgets/${id}`, { fondsReserve: "500.00" });
    check("draft: reserve changed, total follows", goodPut.status === 200 && goodPut.json?.totalAmount === "2500.00", `${goodPut.status} ${goodPut.json?.totalAmount}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    checks.push({ name: "run", ok: false });
  })
  .finally(async () => {
    if (created.length) {
      await (pool as any).unsafe(`DELETE FROM budget_lines WHERE budget_id = ANY($1)`, [created]);
      await (pool as any).unsafe(`DELETE FROM budgets WHERE id = ANY($1)`, [created]);
      console.log(`cleanup: ${created.length} test budget(s) deleted`);
    }
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${checks.length - failed}/${checks.length} budget amount checks passed`);
    await pool.end();
    if (failed) process.exit(1);
  });

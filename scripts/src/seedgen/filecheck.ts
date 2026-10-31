/**
 * files-check: every file of the generated data set is a real, readable file.
 *   - each storage_objects row of the set exists on disk with its recorded size,
 *     and decodes (PDF structure / PNG pixels, see files.ts);
 *   - each file reference of a generated business row (documents, versions,
 *     expenses, invoices, contracts, suppliers, works, claims, incidents,
 *     products, payments) points to a registered, existing file.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { pool } from "@workspace/db";
import { inspectPdf, inspectPng, uploadPath } from "./files.js";

export interface FileCheckReport {
  stored: number;
  pdf: { ok: number; bad: number; pages: number };
  png: { ok: number; bad: number };
  missing: number;
  sizeMismatch: number;
  references: { column: string; refs: number; unknown: number }[];
  failures: string[];
}

/** File columns: [table, column, kind] — "json" holds a JSON array of paths. */
const REFS: [string, string, "one" | "json"][] = [
  ["documents", "file_url", "one"],
  ["document_versions", "file_url", "one"],
  ["expenses", "proof_url", "one"],
  ["invoices", "proof_url", "one"],
  ["contrats_prestataires", "document_url", "one"],
  ["prestataires", "document_url", "one"],
  ["travaux", "report_url", "one"],
  ["travaux", "invoice_url", "one"],
  ["travaux", "photo_urls", "json"],
  ["sinistres", "image_urls", "json"],
  ["sinistres", "invoice_url", "one"],
  ["products", "image_urls", "json"],
  ["appel_payments", "proof_url", "one"],
  ["claim_attachments", "object_path", "one"],
];

export async function checkFiles(preds: Map<string, string>): Promise<FileCheckReport> {
  const rep: FileCheckReport = { stored: 0, pdf: { ok: 0, bad: 0, pages: 0 }, png: { ok: 0, bad: 0 }, missing: 0, sizeMismatch: 0, references: [], failures: [] };
  const stored = (await pool.unsafe(`SELECT object_path, content_type, size FROM storage_objects WHERE ${preds.get("storage_objects")}`)) as unknown as { object_path: string; content_type: string; size: number }[];
  rep.stored = stored.length;
  const known = new Set<string>();
  for (const s of stored) {
    known.add(s.object_path);
    const p = uploadPath(s.object_path);
    if (!p || !existsSync(p)) {
      rep.missing++;
      if (rep.failures.length < 20) rep.failures.push(`absent : ${s.object_path}`);
      continue;
    }
    if (s.size != null && statSync(p).size !== Number(s.size)) rep.sizeMismatch++;
    const buf = readFileSync(p);
    if (s.content_type === "application/pdf") {
      const r = inspectPdf(buf);
      if (r.ok) {
        rep.pdf.ok++;
        rep.pdf.pages += Number(r.detail.split(" ")[0]) || 0;
      } else {
        rep.pdf.bad++;
        if (rep.failures.length < 20) rep.failures.push(`PDF invalide ${s.object_path} : ${r.detail}`);
      }
    } else if (s.content_type === "image/png") {
      const r = inspectPng(buf);
      if (r.ok) rep.png.ok++;
      else {
        rep.png.bad++;
        if (rep.failures.length < 20) rep.failures.push(`PNG invalide ${s.object_path} : ${r.detail}`);
      }
    }
  }
  for (const [t, col, kind] of REFS) {
    const rows = (await pool.unsafe(`SELECT "${col}" AS v FROM "${t}" WHERE ${preds.get(t)} AND "${col}" IS NOT NULL AND "${col}" <> '' AND "${col}" <> '[]'`)) as unknown as { v: string }[];
    let refs = 0;
    let unknown = 0;
    for (const { v } of rows) {
      const paths: string[] = kind === "json" ? (JSON.parse(v) as string[]) : [v];
      for (const p of paths) {
        refs++;
        if (!known.has(p) || !existsSync(uploadPath(p) ?? "")) {
          unknown++;
          if (rep.failures.length < 20) rep.failures.push(`${t}.${col} → fichier non enregistré ou absent : ${p}`);
        }
      }
    }
    rep.references.push({ column: `${t}.${col}`, refs, unknown });
  }
  return rep;
}

export const fileCheckOk = (r: FileCheckReport) => r.missing === 0 && r.sizeMismatch === 0 && r.pdf.bad === 0 && r.png.bad === 0 && r.references.every((x) => x.unknown === 0);

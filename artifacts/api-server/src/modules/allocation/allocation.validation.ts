import { z } from "zod";
import { periodRange } from "../../lib/allocation.js";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date AAAA-MM-JJ").refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Date invalide");

export const PERIOD = z.string().refine((p) => !!periodRange(p), "Période invalide (AAAA, AAAA-Tn ou AAAA-MM)");

export const CHARGE_TYPES = ["charges_courantes", "fonds_reserve", "appel_special"] as const;

export const shareSchema = z
  .object({
    lotId: z.string().min(1),
    // String keeps the exact decimal; validated by the engine (no float).
    coefficient: z.union([z.string(), z.number()]).transform(String).optional(),
    excluded: z.boolean().default(false),
    exclusionReason: z.string().trim().max(300).optional(),
  })
  .strict();

export const versionSchema = z
  .object({
    method: z.enum(["shares", "equal"]),
    categories: z.array(z.string().trim().min(2).max(60)).min(1, "Indiquez au moins une catégorie de charges"),
    effectiveFrom: isoDate,
    sourceReference: z.string().trim().min(3, "Indiquez la source de la règle (règlement, décision d'AG…)").max(500),
    shares: z.array(shareSchema).min(1, "La clé doit lister les lots"),
  })
  .strict();

export const createKeySchema = versionSchema.extend({
  buildingId: z.string().min(1),
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,20}$/, "Code court : lettres, chiffres, - ou _"),
  name: z.string().trim().min(2).max(120),
  purpose: z.string().trim().max(500).optional(),
});

export const sourceSchema = z.union([
  z.object({ type: z.literal("budget_line"), id: z.string().min(1), keyId: z.string().optional() }).strict(),
  z.object({ type: z.literal("expense"), id: z.string().min(1), keyId: z.string().optional() }).strict(),
  z.object({ type: z.literal("budget_total"), budgetId: z.string().min(1), part: z.enum(["charges", "fonds_reserve"]), keyId: z.string().optional() }).strict(),
]);

export const runSchema = z
  .object({
    buildingId: z.string().min(1),
    period: PERIOD,
    chargeType: z.enum(CHARGE_TYPES),
    sources: z.array(sourceSchema).min(1, "Sélectionnez au moins une dépense ou ligne budgétaire").max(50),
    issueDate: isoDate.optional(),
    dueDate: isoDate.optional(),
  })
  .strict();

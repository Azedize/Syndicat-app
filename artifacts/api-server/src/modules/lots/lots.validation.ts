import { z } from "zod";
import { isoDateSchema } from "../../lib/treasury.js";

export const LOT_TYPES = [
  "appartement",
  "duplex",
  "studio",
  "villa",
  "bureau",
  "commerce",
  "local",
  "parking",
  "cave",
  "box",
  "terrain",
  "autre",
] as const;

/** Types that are not on a floor of a building (floor is optional for them). */
export const FLOORLESS_TYPES = new Set(["parking", "cave", "box", "terrain", "villa"]);

// ─── Validation ───────────────────────────────────────────────────────────────
export const referenceSchema = z
  .string()
  .trim()
  .min(1, "La référence du lot est obligatoire")
  .max(30, "Référence trop longue (30 caractères maximum)")
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u, "Référence invalide (lettres, chiffres, espace, . _ / -)");

export const positiveDecimal = z
  .union([z.number(), z.string().trim()])
  .transform((v) => Number(String(v).replace(",", ".")))
  .refine((v) => Number.isFinite(v) && v > 0 && v < 1_000_000, { message: "Surface invalide" });

export const shareSchema = z
  .union([z.number(), z.string().trim()])
  .transform((v) => Math.round(Number(String(v).replace(",", ".")) * 100))
  .refine((c) => Number.isInteger(c) && c > 0 && c <= 10000, { message: "Quote-part invalide (0 < part ≤ 100 %)" });

export const ownersSchema = z
  .array(z.object({ memberId: z.string().min(1), sharePercent: shareSchema }))
  .min(1, "Au moins un propriétaire")
  .max(20)
  .refine((list) => new Set(list.map((o) => o.memberId)).size === list.length, { message: "Propriétaire en double" })
  .refine((list) => list.reduce((s, o) => s + o.sharePercent, 0) === 10000, {
    message: "Les quotes-parts des propriétaires doivent totaliser 100 %",
  });

export const lotFieldsSchema = z.object({
  number: referenceSchema,
  type: z.enum(LOT_TYPES, { errorMap: () => ({ message: "Type de lot invalide" }) }).default("appartement"),
  floor: z.number().int().min(-10).max(200).nullable().optional(),
  surfaceM2: positiveDecimal.nullable().optional(),
  surfaceCadastrale: positiveDecimal.nullable().optional(),
  titreFoncier: z.string().trim().max(60).nullable().optional(),
  tantiemes: z.number().int().min(0, "Tantièmes invalides").max(1_000_000),
  description: z.string().trim().max(2000).nullable().optional(),
});

export const createLotSchema = lotFieldsSchema
  .extend({
    buildingId: z.string().min(1, "L'immeuble est obligatoire"),
    // Either a list of co-owners with shares, or a single owner (100 %).
    owners: ownersSchema.optional(),
    ownerId: z.string().min(1).optional(),
    ownershipStartDate: isoDateSchema.optional(),
    status: z.enum(["occupied", "vacant"]).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (!FLOORLESS_TYPES.has(d.type) && (d.floor === undefined || d.floor === null)) {
      ctx.addIssue({ code: "custom", path: ["floor"], message: "L'étage est obligatoire pour ce type de lot" });
    }
    if (d.owners && d.ownerId) ctx.addIssue({ code: "custom", path: ["owners"], message: "owners ou ownerId, pas les deux" });
  });

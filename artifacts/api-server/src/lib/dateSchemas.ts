import { z } from "zod";

/** Calendar date YYYY-MM-DD that actually exists (2026-13-45 and 2026-02-30 are refused). */
export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date invalide (AAAA-MM-JJ)" })
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), {
    message: "Date invalide",
  });

/** Optional calendar date; an empty field means "not given". */
export const optionalIsoDateSchema = z.preprocess((v) => (v === "" || v === null ? undefined : v), isoDateSchema.optional());

/** Time of day HH:MM (24 h). */
export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Heure invalide (HH:MM)" });

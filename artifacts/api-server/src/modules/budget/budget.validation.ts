import { z } from "zod";
import { amountSchema } from "../../lib/treasury.js";

// "online" is intentionally absent: there is no payment-gateway integration
// yet, so an "online" declaration would be indistinguishable from a claim.
export const submitPaymentSchema = z.object({
  paymentMethod: z.enum(["virement", "cheque", "especes"], {
    errorMap: () => ({ message: "Mode de paiement invalide (virement, chèque ou espèces)" }),
  }),
  // Mandatory: a payment without proof can never be validated by the
  // treasurer, so accepting it would leave the co-owner in a dead end.
  proofUrl: z
    .string({ required_error: "Un justificatif de paiement est obligatoire." })
    .max(500)
    .refine((v) => v.startsWith("/objects/"), {
      message:
        "Le justificatif doit être téléchargé sur le serveur avant la soumission.",
    }),
  notes: z.string().max(1000).optional(),
  // Partial payment: defaults to the remaining balance of the call.
  amount: amountSchema.optional(),
  // Transfer reference or cheque number
  reference: z.string().trim().max(100).optional(),
})
  // Payer, call, amount paid and status are decided by the server: a body
  // trying to set them is refused instead of being silently ignored.
  .strict();

export const generateAppelsSchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/, {
      message: "Période invalide (ex. '2026-05', '2026-Q1' ou '2026')",
    }),
  type: z
    .enum(["charges_courantes", "fonds_reserve", "appel_special"])
    .default("charges_courantes"),
});

export const budgetAmount = z
  .union([z.number(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
  .transform((v) => Number(v).toFixed(2))
  .refine((v) => Number(v) >= 0, { message: "Montant invalide" });

export const updateBudgetSchema = z.object({
  totalAmount: budgetAmount.optional(),
  chargesAmount: budgetAmount.optional(),
  fondsReserve: budgetAmount.optional(),
  status: z.enum(["draft", "submitted", "approved", "closed"]).optional(),
  meetingId: z.string().min(1).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const budgetLineSchema = z.object({
  category: z.string().min(1).max(100),
  label: z.string().min(1).max(300),
  amountAnnual: budgetAmount,
  amountQ1: budgetAmount.optional(),
  amountQ2: budgetAmount.optional(),
  amountQ3: budgetAmount.optional(),
  amountQ4: budgetAmount.optional(),
  prestataireId: z.string().min(1).nullable().optional(),
});

export const createBudgetSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  buildingId: z.string().min(1),
  totalAmount: budgetAmount.optional(),
  chargesAmount: budgetAmount.optional(),
  fondsReserve: budgetAmount.optional(),
  status: z.string().optional(),
  notes: z.string().max(5000).nullable().optional(),
  lines: z.array(budgetLineSchema).max(200).optional(),
});

// Expenses: fields accepted by the create / update endpoints.
import { z } from "zod";
import { amountSchema, categorySchema, isoDateSchema } from "../../lib/treasury.js";

export const expenseFields = z
  .object({
    label: z.string().trim().min(2).max(200),
    category: categorySchema,
    amount: amountSchema,
    buildingId: z.string().optional(),
    supplierName: z.string().trim().max(160).optional(),
    prestataireId: z.string().optional(),
    invoiceNumber: z.string().trim().max(80).optional(),
    invoiceDate: isoDateSchema.optional(),
    proofUrl: z.string().startsWith("/objects/", { message: "La facture doit être téléversée sur MIZAN" }).max(500),
    budgetLineId: z.string().optional(),
  })
  .strict();

export type ExpenseRefs = Partial<Pick<z.infer<typeof expenseFields>, "invoiceDate" | "proofUrl" | "buildingId" | "prestataireId" | "supplierName" | "budgetLineId">>;

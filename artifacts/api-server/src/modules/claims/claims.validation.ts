import { z } from "zod";
import { CLAIM_CATEGORIES, CLAIM_PRIORITIES } from "../../lib/claims.js";

// ─── List, board, record ──────────────────────────────────────────────────────
export const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().max(200).optional(), // comma separated
  category: z.enum(CLAIM_CATEGORIES).optional(),
  priority: z.enum(CLAIM_PRIORITIES).optional(),
  assignee: z.string().max(100).optional(), // "me" | "none" | userId
  overdue: z.enum(["true", "false"]).optional(),
  mine: z.enum(["true", "false"]).optional(),
  sort: z.enum(["recent", "oldest", "due", "priority"]).default("recent"),
});

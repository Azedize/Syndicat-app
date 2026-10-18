import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

/**
 * Former "réclamations" module (HR-style grievances: salary, harassment…),
 * not scoped to a condominium: a syndic could list every syndicate's records.
 * Replaced by the claims & incidents module (routes/claims.ts). The table is
 * kept for its history (personal data export: /me/data-export).
 */
const router = Router();

router.all(["/reclamations", "/reclamations/*rest"], requireAuth, (_req, res) => {
  res.status(410).json({ error: "Module remplacé : utilisez /claims (réclamations de la copropriété)", code: "USE_CLAIMS" });
});

export default router;

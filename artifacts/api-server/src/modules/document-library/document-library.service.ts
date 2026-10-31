import { FinanceError } from "../../lib/treasury.js";
import { EVIDENCE_ENTITY_TYPES } from "../../lib/document-access.js";

/** Deletion guard shared with the soft-delete / purge routes. */
export function assertDeletable(doc: { entityType: string | null; title: string }) {
  if (doc.entityType && EVIDENCE_ENTITY_TYPES.has(doc.entityType)) {
    throw new FinanceError(409, "DOCUMENT_IS_EVIDENCE", "Ce document justifie une opération financière ou une réclamation : il peut être archivé ou remplacé, pas supprimé.");
  }
}

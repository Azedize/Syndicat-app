/**
 * retention.ts — Legal retention policy engine for the Documents module.
 *
 * Every document gets a computed `retentionUntil` date at creation time, based
 * on its category/template. Nothing (soft-deleted or not) is purged before
 * that date — see document-retention-job.ts for the enforcement job.
 */
import type { DocumentTemplate } from "./documentPdf.js";

/** Retention period in years, keyed by document category. */
export const CATEGORY_RETENTION_YEARS: Record<string, number> = {
  finances: 10,       // financial documents — 10 years
  juridique: 10,       // contracts / legal documents — 10 years
  pv: 5,               // meeting reports (PV, comptes-rendus, convocations) — 5 years
  statuts: 10,         // bylaws / certificates — treated as long-lived legal docs
  reglements: 3,       // administrative / internal regulations — 3 years
  attestation: 3,      // attestations — 3 years
};

/** Per-template overrides — takes priority over the category default when present. */
export const TEMPLATE_RETENTION_YEARS: Partial<Record<DocumentTemplate, number>> = {
  contrat: 10,
  convention_partenariat: 10,
  accord_collectif: 10,
  rapport_financier: 10,
  rapport_audit: 10,
  pv: 5,
  compte_rendu: 5,
  convocation: 5,
  mise_en_demeure: 10,
  demande_administrative: 3,
  note_interne: 3,
  ordre_de_mission: 3,
  autorisation: 3,
};

export const DEFAULT_RETENTION_YEARS = 5;

/** Computes the retention-expiry date for a new document. */
export function computeRetentionUntil(
  category: string,
  template: string | null | undefined,
  createdAt: Date = new Date(),
): Date {
  const years: number = Number(
    (template && TEMPLATE_RETENTION_YEARS[template as DocumentTemplate]) ??
      CATEGORY_RETENTION_YEARS[category] ??
      DEFAULT_RETENTION_YEARS,
  );

  const until = new Date(createdAt);
  until.setFullYear(until.getFullYear() + years);
  return until;
}

/** Returns which expiry bucket (in days) a retention date falls into, or null if not expiring soon / already past. */
export function expiryBucket(retentionUntil: Date | string | null, now: Date = new Date()): 30 | 60 | 90 | null {
  if (!retentionUntil) return null;
  const target = new Date(retentionUntil).getTime();
  const diffDays = (target - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return null;
  if (diffDays <= 30) return 30;
  if (diffDays <= 60) return 60;
  if (diffDays <= 90) return 90;
  return null;
}

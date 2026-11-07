import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { requireActiveSubscription } from "../middleware/subscription.js";
import healthRouter from "../modules/health/health.routes.js";
import authRouter from "../modules/auth/auth.routes.js";
import membersRouter from "../modules/members/members.routes.js";
import usersRouter from "../modules/users/users.routes.js";
import syndicatesRouter from "../modules/syndicates/syndicates.routes.js";
import electionsRouter from "../modules/elections/elections.routes.js";
import resignationsRouter from "../modules/governance/resignations.routes.js";
import orgRouter from "../modules/organization/org.routes.js";
import meetingsRouter from "../modules/meetings/meetings.routes.js";
import financeRouter from "../modules/finance/finance.routes.js";
import marketplaceRouter from "../modules/marketplace/marketplace.routes.js";
import chatRouter from "../modules/chat/chat.routes.js";
import documentsRouter from "../modules/documents/documents.routes.js";
import documentLibraryRouter from "../modules/document-library/document-library.routes.js";
import publicationsRouter from "../modules/publications/publications.routes.js";
import contentRouter from "../modules/content/content.routes.js";
import auditRouter from "../modules/audit/audit.routes.js";
import statisticsRouter from "../modules/statistics/statistics.routes.js";
// ─── Condominium Management Routes ────────────────────────────────────────
import buildingsRouter from "../modules/buildings/buildings.routes.js";
import lotsRouter from "../modules/lots/lots.routes.js";
import travauxRouter from "../modules/travaux/travaux.routes.js";
import prestatairesRouter from "../modules/prestataires/prestataires.routes.js";
import budgetRouter from "../modules/budget/budget.routes.js";
import sinistresRouter from "../modules/sinistres/sinistres.routes.js";
import locatairesRouter from "../modules/locataires/locataires.routes.js";
import agRouter from "../modules/ag/ag.routes.js";
import financeBuildingRouter from "../modules/finance-building/finance-building.routes.js";
// ─── P1–P12 feature routes ────────────────────────────────────────────────
import ideasRouter from "../modules/ideas/ideas.routes.js";
import transparencyRouter from "../modules/transparency/transparency.routes.js";
import rankingsRouter from "../modules/rankings/rankings.routes.js";
import teamRouter from "../modules/team/team.routes.js";
import accountRouter from "../modules/account/account.routes.js";
import subscriptionsRouter from "../modules/subscriptions/subscriptions.routes.js";
import parkingRouter from "../modules/parking/parking.routes.js";
import escalationRouter from "../modules/escalation/escalation.routes.js";
import storageRouter from "../modules/storage/storage.routes.js";
import travauxPrivatifsRouter from "../modules/travaux-privatifs/travaux-privatifs.routes.js";
import actionsRouter from "../modules/actions/actions.routes.js";
import pdfRouter from "../modules/pdf/pdf.routes.js";
import attachmentsRouter from "../modules/attachments/attachments.routes.js";
import actesRouter from "../modules/actes/actes.routes.js";
import reclamationsRouter from "../modules/reclamations/reclamations.routes.js";
import claimsRouter from "../modules/claims/claims.routes.js";
import allocationRouter from "../modules/allocation/allocation.routes.js";
import workflowsRouter from "../modules/workflows/workflows.routes.js";
import fichesJuridiquesRouter from "../modules/fiches-juridiques/fiches-juridiques.routes.js";
import emailRouter from "../modules/email/email.routes.js";
import templateStudioRouter from "../modules/template-studio/template-studio.routes.js";
import governanceRouter from "../modules/governance/governance.routes.js";
import organigrammeRouter from "../modules/organigramme/organigramme.routes.js";
import stripeRouter from "../modules/stripe/stripe.routes.js";
import meRouter from "../modules/me/me.routes.js";
import treasuryRouter from "../modules/treasury/treasury.routes.js";
import organizationsRouter from "../modules/organizations/organizations.routes.js";
import expensesRouter from "../modules/expenses/expenses.routes.js";

const router: IRouter = Router();

// ─── Subscription enforcement (Scenario 7) ────────────────────────────────────
// Block all write operations when the syndicate's subscription is expired or
// suspended. GET / HEAD / OPTIONS are read-only and always pass through.
// Auth routes (/auth/*) are always exempt — login/refresh/logout must work even
// on expired subscriptions so users can still sign in to read their data.
// requireActiveSubscription reads req.user set by the global softAuth middleware.
// super_admin is always exempt (platform owner, no subscription constraint).
router.use((req: Request, res: Response, next: NextFunction) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.path.startsWith("/auth/")) return next();
  // Deleting one's account never depends on the condominium's subscription.
  if (req.path === "/account-deletion" || req.path === "/me/account/delete") return next();
  // Nor does signing out on a phone.
  if (req.path === "/users/push-token") return next();
  // Billing recovery must remain available when a subscription is expired,
  // cancelled, or awaiting payment; otherwise the customer cannot renew or
  // retry the payment that would restore access.
  if (req.path.startsWith("/subscriptions")) return next();
  // Company-level management (condominium creation, lifecycle, staff) does
  // not depend on the subscription of the condominium currently open.
  if (req.path.startsWith("/organizations") || req.path.startsWith("/condominiums")) return next();
  return requireActiveSubscription(req, res, next);
});

router.use(healthRouter);
router.use(authRouter);
router.use(accountRouter);
router.use(membersRouter);
router.use(usersRouter);
router.use(syndicatesRouter);
router.use(electionsRouter);
router.use(resignationsRouter);
router.use(orgRouter);
router.use(meetingsRouter);
router.use(financeRouter);
router.use(treasuryRouter);
router.use(organizationsRouter);
router.use(expensesRouter);
router.use(marketplaceRouter);
router.use(chatRouter);
// Registered first: its /documents, /download-url and /versions replace the
// former handlers of documents.ts.
router.use(documentLibraryRouter);
router.use(documentsRouter);
router.use(publicationsRouter);
router.use(contentRouter);
router.use(auditRouter);
router.use(statisticsRouter);
// ─── Condominium ──────────────────────────────────────────────────────────
router.use(buildingsRouter);
router.use(lotsRouter);
router.use(travauxRouter);
router.use(prestatairesRouter);
router.use(budgetRouter);
router.use(sinistresRouter);
router.use(locatairesRouter);
router.use(agRouter);
router.use(financeBuildingRouter);
// ─── P1–P12 features ────────────────────────────────────────────────────────
router.use(ideasRouter);
router.use(transparencyRouter);
router.use(rankingsRouter);
router.use(teamRouter);
router.use(subscriptionsRouter);
router.use(stripeRouter);
router.use(parkingRouter);
router.use(escalationRouter);
router.use(storageRouter);
router.use(travauxPrivatifsRouter);
router.use(actionsRouter);
router.use(pdfRouter);
router.use(attachmentsRouter);
router.use(actesRouter);
router.use(reclamationsRouter);
router.use(claimsRouter);
router.use(allocationRouter);
router.use(workflowsRouter);
router.use(fichesJuridiquesRouter);
router.use(emailRouter);
router.use(templateStudioRouter);
router.use(governanceRouter);
router.use(organigrammeRouter);
router.use(meRouter);

export default router;

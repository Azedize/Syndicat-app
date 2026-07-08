import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import membersRouter from "./members.js";
import usersRouter from "./users.js";
import syndicatesRouter from "./syndicates.js";
import electionsRouter from "./elections.js";
import meetingsRouter from "./meetings.js";
import financeRouter from "./finance.js";
import marketplaceRouter from "./marketplace.js";
import chatRouter from "./chat.js";
import documentsRouter from "./documents.js";
import publicationsRouter from "./publications.js";
import contentRouter from "./content.js";
import auditRouter from "./audit.js";
import statisticsRouter from "./statistics.js";
// ─── Condominium Management Routes ────────────────────────────────────────
import buildingsRouter from "./buildings.js";
import lotsRouter from "./lots.js";
import travauxRouter from "./travaux.js";
import prestatairesRouter from "./prestataires.js";
import budgetRouter from "./budget.js";
import sinistresRouter from "./sinistres.js";
import locatairesRouter from "./locataires.js";
import agRouter from "./ag.js";
import financeBuildingRouter from "./finance-building.js";
// ─── P1–P12 feature routes ────────────────────────────────────────────────
import ideasRouter from "./ideas.js";
import transparencyRouter from "./transparency.js";
import rankingsRouter from "./rankings.js";
import teamRouter from "./team.js";
import subscriptionsRouter from "./subscriptions.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(membersRouter);
router.use(usersRouter);
router.use(syndicatesRouter);
router.use(electionsRouter);
router.use(meetingsRouter);
router.use(financeRouter);
router.use(marketplaceRouter);
router.use(chatRouter);
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

export default router;

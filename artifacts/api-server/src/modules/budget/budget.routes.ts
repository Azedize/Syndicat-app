import { Router } from "express";
import budgetsRouter from "./budget.budgets.routes.js";
import appelsRouter from "./budget.appels.routes.js";
import debtsRouter from "./budget.debts.routes.js";

// Order matters: Express matches routes in registration order.
const router = Router();
router.use(budgetsRouter);
router.use(appelsRouter);
router.use(debtsRouter);

export default router;

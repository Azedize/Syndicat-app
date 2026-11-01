import { Router } from "express";
import readRouter from "./elections.read.routes.js";
import setupRouter from "./elections.setup.routes.js";
import candidatesRouter from "./elections.candidates.routes.js";
import votingRouter from "./elections.voting.routes.js";
import resultsRouter from "./elections.results.routes.js";

// Order matters: Express matches routes in registration order.
const router = Router();
router.use(readRouter);
router.use(setupRouter);
router.use(candidatesRouter);
router.use(votingRouter);
router.use(resultsRouter);

export default router;

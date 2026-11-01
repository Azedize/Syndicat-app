import { Router } from "express";
import conversationsRouter from "./chat.conversations.routes.js";
import messagesRouter from "./chat.messages.routes.js";
import safetyRouter from "./chat.safety.routes.js";

// Order matters: Express matches routes in registration order.
const router = Router();
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(safetyRouter);

export default router;

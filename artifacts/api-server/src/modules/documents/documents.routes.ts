/**
 * routes/documents.ts
 *
 * Document module — Enterprise-grade implementation:
 *  • RBAC with syndicate isolation
 *  • Soft delete with legal retention (is_deleted / deleted_at / deleted_by)
 *  • Full syndicate branding in PDF generation
 *  • Direct templateId override in POST body
 *  • Workflow state machine: draft → generated → pending_review → validated → signed → published → archived
 *  • Signed download URL (1h TTL)
 *  • Multi-signature tracking
 *  • Push + alert notifications on key lifecycle events
 *  • Full audit trail on every write
 */

import { Router } from "express";
import catalogRouter from "./documents.catalog.routes.js";
import verifyRouter from "./documents.verify.routes.js";
import requestsRouter from "./documents.requests.routes.js";
import bundlesRouter from "./documents.bundles.routes.js";
import crudRouter from "./documents.crud.routes.js";
import signingRouter from "./documents.signing.routes.js";

// Order matters: Express matches routes in registration order.
const router = Router();
// GET /documents (search, filters, pagination): see modules/document-library/document-library.routes.ts
router.use(catalogRouter);
router.use(verifyRouter);
router.use(requestsRouter);
router.use(bundlesRouter);
router.use(crudRouter);
router.use(signingRouter);

export default router;

import { Router } from "express";
import catalogRouter from "./marketplace.catalog.routes.js";
import listingsRouter from "./marketplace.listings.routes.js";
import sellersRouter from "./marketplace.sellers.routes.js";
import shopRouter from "./marketplace.shop.routes.js";

// Order matters: Express matches routes in registration order.
const router = Router();
router.use(catalogRouter);
router.use(listingsRouter);
router.use(sellersRouter);
router.use(shopRouter);

export default router;

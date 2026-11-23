import { Router } from "express";
import * as controller from "../controllers/contact.controller";
import { newsletterLimiter } from "../middleware/rate-limit";

const router = Router();
router.post("/subscribe", newsletterLimiter, controller.subscribe);
router.post("/unsubscribe", newsletterLimiter, controller.unsubscribe);

export default router;
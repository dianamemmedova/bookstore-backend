import { Router } from "express";
import * as controller from "../controllers/gift-card.controller";
import { giftBalanceLimiter } from "../middleware/rate-limit";

const router = Router();
// POST: kart nömrəsi URL-də və server loglarında görünməsin deyə
router.post("/balance", giftBalanceLimiter, controller.checkBalance);

export default router;
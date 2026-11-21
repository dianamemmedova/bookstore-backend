import { Router } from "express";
import * as controller from "../controllers/promo.controller";
import { optionallyAuthenticated } from "../middleware/stacks";
import { promoLimiter } from "../middleware/rate-limit";

const router = Router();

// Qonaq da yoxlaya bilər; token göndərilibsə "bu kodu artıq işlətmisən?" da yoxlanır
router.post("/validate", promoLimiter, optionallyAuthenticated, controller.validatePromo);

export default router;
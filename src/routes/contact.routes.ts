import { Router } from "express";
import * as controller from "../controllers/contact.controller";
import { contactLimiter } from "../middleware/rate-limit";
import { optionallyAuthenticated } from "../middleware/stacks";

const router = Router();
// Qonaq da yaza bilər. Token varsa mesaj həmin istifadəçiyə bağlanır.
router.post("/", contactLimiter, optionallyAuthenticated, controller.sendContact);

export default router;
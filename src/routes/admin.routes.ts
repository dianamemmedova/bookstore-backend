import { Router } from "express";
import * as controller from "../controllers/admin.controller";
import { adminOnly } from "../middleware/stacks";

const router = Router();
router.use(adminOnly);

router.get("/users", controller.listUsers);

export default router;
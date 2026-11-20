import { Router } from "express";
import * as controller from "../controllers/me.controller";
import { authenticated } from "../middleware/stacks";

const router = Router();
router.use(authenticated);

router.get("/", controller.getMe);
router.patch("/", controller.updateMe);
router.put("/password", controller.changePassword);

export default router;
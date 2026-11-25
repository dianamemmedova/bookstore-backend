import { Router } from "express";
import * as controller from "../controllers/audio.controller";

const router = Router();

router.get("/:token", controller.stream);

export default router;
import { Router } from "express";
import * as controller from "../controllers/book.controller";
import * as audioController from "../controllers/audio.controller";
import { authenticated } from "../middleware/stacks";

const router = Router();

router.get("/", controller.listBooks);
router.get("/:id", controller.getBook);
router.get("/:id/audio-access", authenticated, audioController.audioAccess);

export default router;
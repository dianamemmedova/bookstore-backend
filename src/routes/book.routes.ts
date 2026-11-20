import { Router } from "express";
import * as controller from "../controllers/book.controller";

const router = Router();

router.get("/", controller.listBooks);
router.get("/:id", controller.getBook);

export default router;
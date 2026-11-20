import { Router } from "express";
import * as controller from "../controllers/admin.controller";
import * as bookController from "../controllers/admin-book.controller";
import { adminOnly } from "../middleware/stacks";
import { uploadCover } from "../middleware/upload";

const router = Router();
router.use(adminOnly);

router.get("/users", controller.listUsers);

router.post("/books", bookController.createBook);
router.patch("/books/:id", bookController.updateBook);
router.delete("/books/:id", bookController.deleteBook);
router.post("/books/:id/cover", uploadCover, bookController.uploadCover);

export default router;
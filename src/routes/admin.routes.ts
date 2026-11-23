import { Router } from "express";
import * as controller from "../controllers/admin.controller";
import * as bookController from "../controllers/admin-book.controller";
import * as promoController from "../controllers/admin-promo.controller";
import * as orderController from "../controllers/admin-order.controller";
import { adminOnly } from "../middleware/stacks";
import { uploadCover } from "../middleware/upload";

const router = Router();
router.use(adminOnly);

router.get("/users", controller.listUsers);

router.post("/books", bookController.createBook);
router.patch("/books/:id", bookController.updateBook);
router.delete("/books/:id", bookController.deleteBook);
router.post("/books/:id/cover", uploadCover, bookController.uploadCover);

router.get("/promos", promoController.listPromos);
router.post("/promos", promoController.createPromo);
router.patch("/promos/:id", promoController.updatePromo);
router.delete("/promos/:id", promoController.deletePromo);

router.get("/orders", orderController.listOrders);
router.get("/orders/:id", orderController.getOrder);
router.patch("/orders/:id/status", orderController.updateStatus);

export default router;
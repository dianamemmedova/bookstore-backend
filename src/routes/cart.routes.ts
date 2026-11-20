import { Router } from "express";
import * as controller from "../controllers/cart.controller";
import { authenticated } from "../middleware/stacks";

const router = Router();
router.use(authenticated);

router.get("/", controller.getCart);
router.delete("/", controller.clearCart);
router.post("/merge", controller.mergeCart);
router.put("/items/:bookId", controller.setItemQuantity);
router.delete("/items/:bookId", controller.removeItem);

export default router;
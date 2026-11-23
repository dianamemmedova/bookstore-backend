import { Router } from "express";
import * as controller from "../controllers/order.controller";
import { authenticated } from "../middleware/stacks";

const router = Router();
router.use(authenticated);

router.post("/", controller.checkout);
router.get("/", controller.listMyOrders);
router.get("/:id", controller.getMyOrder);
router.post("/:id/cancel", controller.cancelMyOrder);

export default router;